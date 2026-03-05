import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { LlmService } from '../../infrastructure/llm/llm.service';
import { LangfuseService } from '../../infrastructure/llm/langfuse.service';
import { McpClientService } from '../../infrastructure/mcp/mcp-client.service';
import { GetRecentOrdersQuery } from '../../domain/orders/queries';
import { Order } from '../../domain/orders/order.entity';

/**
 * Pattern 3: AI as Supervisor
 *
 * In this pattern, AI acts as a "supervisor" - reviews results from other
 * systems (including other AIs) and looks for anomalies or problems.
 *
 * Key elements:
 * - Batch processing - multiple records in single LLM call (token optimization)
 * - Scheduled execution - not triggered by event, runs periodically
 * - Alerting - escalation via external systems (Slack via MCP)
 * - Summarization - data compression before sending to LLM
 */

// Valid issue types
const ISSUE_TYPES = [
  'suspicious_total',
  'missing_critical_data',
  'low_confidence',
  'unusual_pattern',
  'potential_fraud',
  'other',
] as const;

// Normalize issue type from LLM response (handles case differences, underscores vs spaces, etc.)
const normalizeIssueType = (value: string): (typeof ISSUE_TYPES)[number] => {
  const normalized = value.toLowerCase().replace(/[\s-]/g, '_');
  if (ISSUE_TYPES.includes(normalized as (typeof ISSUE_TYPES)[number])) {
    return normalized as (typeof ISSUE_TYPES)[number];
  }
  return 'other';
};

// Schema for quality check results
const QualityCheckResultSchema = z.object({
  flaggedOrders: z.array(
    z.object({
      orderId: z.string(),
      issue: z.string().transform(normalizeIssueType),
      severity: z.string().transform((v) => {
        const normalized = v.toLowerCase();
        if (['low', 'medium', 'high', 'critical'].includes(normalized)) {
          return normalized as 'low' | 'medium' | 'high' | 'critical';
        }
        return 'medium';
      }),
      explanation: z.string(),
    }),
  ),
  summary: z.string(),
  totalChecked: z.number(),
});

type QualityCheckResult = z.infer<typeof QualityCheckResultSchema>;

// Confidence threshold below which order is suspicious
const CONFIDENCE_THRESHOLD = 0.6;

// Maximum number of orders in single batch (token optimization)
const BATCH_SIZE = 20;

const QUALITY_CHECK_PROMPT = `You are a quality assurance AI reviewing extracted order data. Your job is to find anomalies and potential problems.

Check for these issues:
1. SUSPICIOUS_TOTAL: Sum of item prices × quantities doesn't match the total
2. MISSING_CRITICAL_DATA: orderId, customerName, or items is null/empty
3. LOW_CONFIDENCE: Confidence score below ${CONFIDENCE_THRESHOLD}
4. UNUSUAL_PATTERN: Very large quantities, duplicate items, suspicious pricing
5. POTENTIAL_FRAUD: Multiple red flags together, unrealistic data

Severity levels:
- critical: Potential fraud, requires immediate human review
- high: Significant data quality issue, should be reviewed
- medium: Minor inconsistency, can be auto-corrected or queued for review
- low: Cosmetic issue, informational

Review the batch of orders and return:
{
  "flaggedOrders": [
    {
      "orderId": "string",
      "issue": "issue_type",
      "severity": "severity_level",
      "explanation": "Brief explanation"
    }
  ],
  "summary": "Overall batch quality assessment",
  "totalChecked": number
}

If all orders look good, return empty flaggedOrders array.`;

@Injectable()
export class QualityCheckService {
  private readonly logger = new Logger(QualityCheckService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly langfuse: LangfuseService,
    // MCP is ready to use when we add Slack integration
    private readonly _mcp: McpClientService,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * Scheduled quality check - runs every 5 minutes.
   * In production, adjust interval based on data volume.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runScheduledCheck(): Promise<void> {
    this.logger.log('Starting scheduled quality check');
    await this.checkRecentOrders();
  }

  /**
   * Main method - checks recent orders with extractedData.
   * Can also be called manually (e.g., via API).
   */
  async checkRecentOrders(): Promise<QualityCheckResult | null> {
    const jobId = `quality-check-${Date.now()}`;

    const trace = this.langfuse.createTrace(jobId, 'quality-check');

    try {
      // Get recent orders with extractedData
      const orders = await this.queryBus.execute<GetRecentOrdersQuery, Order[]>(
        new GetRecentOrdersQuery(BATCH_SIZE),
      );

      // Filter only those with extractedData
      const ordersWithData = orders.filter((o) => o.extractedData);

      if (ordersWithData.length === 0) {
        this.logger.log('No orders with extracted data to check');
        return null;
      }

      trace.update({
        metadata: {
          totalOrders: orders.length,
          ordersWithData: ordersWithData.length,
        },
      });

      // Token optimization: summarize data before sending to LLM
      const summarizedData = this.summarizeForReview(ordersWithData);

      // Batch processing: single call for all orders
      const result = await this.llm.completeWithSchema<QualityCheckResult>(
        {
          // Summarize task - cheaper model is sufficient
          model: this.llm.getModelForTask('summarize'),
          system: QUALITY_CHECK_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Review these orders:\n\n${summarizedData}`,
            },
          ],
        },
        { jobId, step: 'batch-quality-check' },
        QualityCheckResultSchema,
      );

      // Log results
      trace.update({
        output: {
          flaggedCount: result.flaggedOrders.length,
          summary: result.summary,
        },
      });

      // If there are critical issues - alert!
      const criticalIssues = result.flaggedOrders.filter(
        (f) => f.severity === 'critical',
      );

      if (criticalIssues.length > 0) {
        this.sendAlert(criticalIssues, jobId);
      }

      this.logger.log(
        `Quality check complete: ${result.flaggedOrders.length} issues found`,
      );

      await this.langfuse.flush();
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Quality check failed: ${err.message}`, err.stack);

      trace.update({
        output: { error: err.message, status: 'ERROR' },
      });

      await this.langfuse.flush();
      return null;
    }
  }

  /**
   * Token optimization: compresses order data to minimum needed
   * for quality check. We don't send full objects.
   */
  private summarizeForReview(orders: Order[]): string {
    return orders
      .map((order) => {
        const extracted = order.extractedData as Record<string, unknown>;

        // Extract only fields needed for quality check
        return JSON.stringify({
          id: order.id,
          orderId: extracted?.orderId ?? null,
          customerName: extracted?.customerName ?? null,
          itemCount: Array.isArray(extracted?.items)
            ? (extracted.items as unknown[]).length
            : 0,
          itemsSummary: this.summarizeItems(extracted?.items),
          total: extracted?.total ?? null,
          dbTotal: order.total,
          confidence: extracted?.confidence ?? null,
        });
      })
      .join('\n');
  }

  /**
   * Summarizes items to minimum - only count and total value
   */
  private summarizeItems(
    items: unknown,
  ): { count: number; calculatedTotal: number } | null {
    if (!Array.isArray(items)) return null;

    const typedItems = items as { quantity?: number; price?: number }[];
    const calculatedTotal = typedItems.reduce((sum, item) => {
      const qty = item.quantity ?? 0;
      const price = item.price ?? 0;
      return sum + qty * price;
    }, 0);

    return {
      count: typedItems.length,
      calculatedTotal,
    };
  }

  /**
   * Sends alert about critical issues.
   * In production: Slack, PagerDuty, email etc. via MCP.
   */
  private sendAlert(
    criticalIssues: QualityCheckResult['flaggedOrders'],
    jobId: string,
  ): void {
    const alertMessage = `🚨 Quality Check Alert!\n\nFound ${criticalIssues.length} critical issue(s):\n\n${criticalIssues
      .map(
        (issue) =>
          `• Order ${issue.orderId}: ${issue.issue}\n  ${issue.explanation}`,
      )
      .join('\n\n')}`;

    this.logger.warn(`CRITICAL QUALITY ALERT:\n${alertMessage}`);

    // TODO: Send via MCP to Slack when configured
    // try {
    //   await this.mcp.callTool('slack', 'postMessage', {
    //     channel: '#alerts',
    //     text: alertMessage,
    //   });
    // } catch (error) {
    //   this.logger.error(`Failed to send Slack alert: ${error.message}`);
    // }

    // Log alert in Langfuse for audit
    const trace = this.langfuse.createTrace(`${jobId}-alert`, 'quality-alert');
    trace.update({
      output: {
        alertSent: true,
        criticalCount: criticalIssues.length,
        orderIds: criticalIssues.map((i) => i.orderId),
        status: 'WARNING',
      },
    });
  }
}
