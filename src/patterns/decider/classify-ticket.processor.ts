import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { z } from 'zod';
import { ClassificationResult, TicketsService } from '../../domain/tickets';
import {
  TicketCategory,
  TicketDepartment,
  TicketPriority,
} from '../../domain/tickets/ticket.entity';
import { LangfuseService } from '../../infrastructure/llm/langfuse.service';
import { LlmService } from '../../infrastructure/llm/llm.service';
import { McpClientService } from '../../infrastructure/mcp/mcp-client.service';
import { QUEUES } from '../../infrastructure/queue/queue.module';

/**
 * Pattern 2: AI as Decider
 *
 * In this pattern, AI makes decisions based on context and rules.
 * Unlike Executor: here LLM chooses among options, not just parses data.
 *
 * Key elements:
 * - Context enrichment via MCP (customer data, order history)
 * - Enum validation - AI must choose from allowed list
 * - Fallback strategy - when AI returns invalid value
 * - Routing - AI decision determines further flow (queueing to handler)
 */

// Schema with allowed values - AI must choose from this list
const ClassificationSchema = z.object({
  category: z.enum(['billing', 'technical', 'shipping', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  department: z.enum(['support', 'sales', 'logistics', 'engineering']),
  reasoning: z.string(), // Decision justification for audit
});

type Classification = z.infer<typeof ClassificationSchema>;

// Defaults when AI fails - safe values
const DEFAULT_CLASSIFICATION: ClassificationResult = {
  category: TicketCategory.GENERAL,
  priority: TicketPriority.MEDIUM,
  department: TicketDepartment.SUPPORT,
};

export interface ClassifyTicketJobData {
  ticketId: string;
  content: string;
  customerId: string;
}

// Category to queue/handler mapping (for future use in routeToHandler)
// const DEPARTMENT_QUEUES: Record<TicketDepartment, string> = {
//   [TicketDepartment.SUPPORT]: 'ticket-support',
//   [TicketDepartment.SALES]: 'ticket-sales',
//   [TicketDepartment.LOGISTICS]: 'ticket-logistics',
//   [TicketDepartment.ENGINEERING]: 'ticket-engineering',
// };

const CLASSIFICATION_PROMPT = `You are a customer support ticket classifier. Analyze the ticket content and customer context to classify the ticket.

Classification rules:
- CATEGORY: What is the ticket about?
  - billing: Payment issues, invoices, refunds, subscription problems
  - technical: Product bugs, errors, how-to questions, integration issues
  - shipping: Delivery status, lost packages, address changes
  - general: Everything else

- PRIORITY: How urgent is this?
  - urgent: Service down, security issue, angry VIP customer
  - high: Significant problem, multiple users affected, gold/platinum customer
  - medium: Normal issue, single user, standard customer
  - low: Feature request, minor inconvenience, informational

- DEPARTMENT: Who should handle this?
  - engineering: Technical bugs, integration issues
  - logistics: Shipping, delivery, warehouse issues
  - sales: Pricing, upgrades, renewals
  - support: Everything else (default)

Customer tier affects priority:
- gold/platinum customers: bump priority by one level
- Multiple recent orders: consider higher priority for shipping issues

Return JSON:
{
  "category": "billing" | "technical" | "shipping" | "general",
  "priority": "low" | "medium" | "high" | "urgent",
  "department": "support" | "sales" | "logistics" | "engineering",
  "reasoning": "Brief explanation of your decision"
}`;

@Processor(QUEUES.CLASSIFICATION)
export class ClassifyTicketProcessor extends WorkerHost {
  private readonly logger = new Logger(ClassifyTicketProcessor.name);

  constructor(
    private readonly llm: LlmService,
    private readonly langfuse: LangfuseService,
    private readonly mcp: McpClientService,
    private readonly ticketsService: TicketsService,
  ) {
    super();
  }

  async process(
    job: Job<ClassifyTicketJobData>,
  ): Promise<ClassificationResult> {
    const { ticketId, content, customerId } = job.data;
    const jobId = job.id ?? `classify-${ticketId}`;

    this.logger.log(
      `Processing classification job ${jobId} for ticket ${ticketId}`,
    );

    const trace = this.langfuse.createTrace(jobId, 'classify-ticket');

    try {
      // Token optimization: fetch only needed context, limit to 5 orders
      const customerContext = await this.fetchCustomerContext(customerId);

      trace.update({
        metadata: {
          ticketId,
          customerId,
          contentLength: content.length,
          hasCustomerData: customerContext !== null,
        },
      });

      // Decision requires context understanding - use more expensive model
      const classification = await this.classifyWithFallback(
        content,
        customerContext,
        jobId,
      );

      // Get ticket BEFORE update
      const ticketBefore = this.ticketsService.findById(ticketId);

      // Save classification to ticket
      const result: ClassificationResult = {
        category: classification.category as TicketCategory,
        priority: classification.priority as TicketPriority,
        department: classification.department as TicketDepartment,
      };

      this.ticketsService.updateClassification(ticketId, result);

      // Get ticket AFTER update
      const ticketAfter = this.ticketsService.findById(ticketId);

      // AUDIT LOG
      this.logger.log(`\n${'='.repeat(50)}`);
      this.logger.log(`[AUDIT] Classification for ${ticketId}`);
      this.logger.log(`${'='.repeat(50)}`);

      this.logger.log(`\n>>> CUSTOMER CONTEXT (from MCP):`);
      this.logger.log(customerContext ?? '(No context available)');

      this.logger.log(`\n>>> LLM DECISION:`);
      this.logger.log(JSON.stringify(classification, null, 2));

      this.logger.log(`\n>>> TICKET BEFORE:`);
      this.logger.log(JSON.stringify(ticketBefore, null, 2));

      this.logger.log(`\n>>> TICKET AFTER:`);
      this.logger.log(JSON.stringify(ticketAfter, null, 2));

      this.logger.log(`\n${'='.repeat(50)}\n`);

      // Log decision for Langfuse
      trace.update({
        output: {
          classification: result,
          reasoning: classification.reasoning,
        },
      });

      // TODO: Queue to appropriate handler
      // await this.routeToHandler(ticketId, result);

      await this.langfuse.flush();
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Classification failed for ${ticketId}: ${err.message}`,
        err.stack,
      );

      trace.update({
        output: { error: err.message, status: 'ERROR' },
      });

      await this.langfuse.flush();
      throw error;
    }
  }

  /**
   * Fetches customer context via MCP.
   * Token optimization: limit order history to last 5.
   */
  private async fetchCustomerContext(
    customerId: string,
  ): Promise<string | null> {
    try {
      // Parallel fetching of customer data and recent orders
      const [customerData, ordersData] = await Promise.all([
        this.mcp.callTool('orders', 'getCustomer', { customerId }),
        this.mcp.callTool('orders', 'getCustomerOrders', {
          customerId,
          limit: 5, // Token optimization: only last 5 orders
        }),
      ]);

      return `Customer Info:\n${customerData}\n\nRecent Orders:\n${ordersData}`;
    } catch (error) {
      // MCP failure should not block classification
      const err = error as Error;
      this.logger.warn(
        `Failed to fetch customer context for ${customerId}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Classifies ticket with fallback to default values.
   * If LLM returns invalid values or errors, use safe defaults.
   */
  private async classifyWithFallback(
    content: string,
    customerContext: string | null,
    jobId: string,
  ): Promise<Classification> {
    try {
      const contextSection = customerContext
        ? `\n\nCustomer Context:\n${customerContext}`
        : '\n\n(No customer context available)';

      return await this.llm.completeWithSchema<Classification>(
        {
          // Decisions require better reasoning - sonnet
          model: this.llm.getModelForTask('decide'),
          system: CLASSIFICATION_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Ticket content:\n${content}${contextSection}`,
            },
          ],
        },
        { jobId, step: 'classification' },
        ClassificationSchema,
      );
    } catch (error) {
      // Fallback: return default values instead of failing entire job
      const err = error as Error;
      this.logger.warn(
        `Classification LLM failed, using defaults: ${err.message}`,
      );

      return {
        ...DEFAULT_CLASSIFICATION,
        reasoning: `Fallback classification due to error: ${err.message}`,
      };
    }
  }

  /**
   * Routes ticket to appropriate handler based on department.
   * TODO: Add queues for individual departments.
   */
  // private async routeToHandler(
  //   ticketId: string,
  //   classification: ClassificationResult,
  // ): Promise<void> {
  //   const queueName = DEPARTMENT_QUEUES[classification.department];
  //   // Here we would add to appropriate queue
  //   this.logger.log(`Would route ticket ${ticketId} to queue ${queueName}`);
  // }
}
