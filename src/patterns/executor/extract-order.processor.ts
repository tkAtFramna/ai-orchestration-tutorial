import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { LlmService } from '../../infrastructure/llm/llm.service';
import { LangfuseService } from '../../infrastructure/llm/langfuse.service';
import { UpdateOrderExtractedDataCommand } from '../../domain/orders/commands';
import { GetOrderByIdQuery } from '../../domain/orders/queries';
import { Order } from '../../domain/orders/order.entity';
import { QUEUES } from '../../infrastructure/queue/queue.module';

/**
 * Pattern 1: AI as Executor
 *
 * In this pattern, AI performs a specific task (data extraction) without making
 * business decisions. LLM acts as an "intelligent parser" - receives input and must
 * return structured data conforming to a schema.
 *
 * Key elements:
 * - Strict schema validation (Zod) - don't trust LLM output blindly
 * - Confidence score - enables human-in-the-loop for uncertain results
 * - Traceability - each job has correlation ID in Langfuse
 */

// Schema for extracted order data
// Allow nulls for missing data - LLM may not find all fields in messy input
const ExtractedOrderSchema = z.object({
  orderId: z.string().nullable(),
  customerName: z.string().nullable(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().nullable(),
        price: z.number().nullable(),
      }),
    )
    .nullable(),
  total: z.number().nullable(),
  // Confidence enables routing: high confidence -> auto-process, low -> human review
  confidence: z.number().min(0).max(1),
});

type ExtractedOrder = z.infer<typeof ExtractedOrderSchema>;

export interface ExtractOrderJobData {
  orderId: string; // Order entity ID in our database
  rawText: string; // Text to process (email, message, etc.)
}

const EXTRACTION_PROMPT = `You are an order extraction system. Extract order information from the provided text.

Rules:
- Extract only what is explicitly stated in the text
- If a field is not mentioned, return null for that field
- For items, extract name, quantity, and price for each item
- Calculate confidence based on how clear and complete the information is:
  - 1.0 = all fields clearly stated
  - 0.7-0.9 = most fields clear, some inferred
  - 0.4-0.6 = partial information, some guessing
  - 0.1-0.3 = very incomplete, mostly guessing
  - 0.0 = cannot extract anything meaningful

Return valid JSON matching this structure:
{
  "orderId": string | null,
  "customerName": string | null,
  "items": [{"name": string, "quantity": number | null, "price": number | null}] | null,
  "total": number | null,
  "confidence": number
}`;

@Processor(QUEUES.EXTRACTION)
export class ExtractOrderProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractOrderProcessor.name);

  constructor(
    private readonly llm: LlmService,
    private readonly langfuse: LangfuseService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {
    super();
  }

  async process(job: Job<ExtractOrderJobData>): Promise<ExtractedOrder> {
    const { orderId, rawText } = job.data;
    const jobId = job.id ?? `extract-${orderId}`;

    this.logger.log(`Processing extraction job ${jobId} for order ${orderId}`);

    // Langfuse trace - correlation between queue and LLM monitoring
    const trace = this.langfuse.createTrace(jobId, 'extract-order');
    trace.update({
      metadata: {
        orderId,
        textLength: rawText.length,
      },
    });

    try {
      // Token optimization: use cheaper model for extraction
      // (haiku instead of sonnet) as this is a simple structural task
      const extracted = await this.llm.completeWithSchema<ExtractedOrder>(
        {
          model: this.llm.getModelForTask('extract'),
          system: EXTRACTION_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Extract order information from this text:\n\n${rawText}`,
            },
          ],
        },
        { jobId, step: 'extraction' },
        ExtractedOrderSchema,
      );

      // Get order state BEFORE update
      const orderBefore: Order | null = await this.queryBus.execute(
        new GetOrderByIdQuery(orderId),
      );

      // Save extracted data to Order entity
      await this.commandBus.execute(
        new UpdateOrderExtractedDataCommand(orderId, extracted),
      );

      // Get order state AFTER update
      const orderAfter: Order | null = await this.queryBus.execute(
        new GetOrderByIdQuery(orderId),
      );

      // AUDIT LOG: Show all three sections
      this.logger.log(`\n${'='.repeat(50)}`);
      this.logger.log(
        `[AUDIT] Extraction for ${orderId} (confidence: ${extracted.confidence})`,
      );
      this.logger.log(`${'='.repeat(50)}`);

      this.logger.log(`\n>>> EXTRACTED DATA (from LLM):`);
      this.logger.log(JSON.stringify(extracted, null, 2));

      this.logger.log(`\n>>> ORDER BEFORE:`);
      this.logger.log(JSON.stringify(orderBefore, null, 2));

      this.logger.log(`\n>>> ORDER AFTER:`);
      this.logger.log(JSON.stringify(orderAfter, null, 2));

      this.logger.log(`\n${'='.repeat(50)}\n`);

      // Log success with confidence for later analysis
      trace.update({
        output: {
          confidence: extracted.confidence,
          hasOrderId: extracted.orderId !== null,
          hasCustomerName: extracted.customerName !== null,
          itemCount: extracted.items?.length ?? 0,
        },
      });

      await this.langfuse.flush();
      return extracted;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Extraction failed for ${orderId}: ${err.message}`,
        err.stack,
      );

      trace.update({
        output: { error: err.message, status: 'ERROR' },
      });

      await this.langfuse.flush();
      throw error;
    }
  }
}
