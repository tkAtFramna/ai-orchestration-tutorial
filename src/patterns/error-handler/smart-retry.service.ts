import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../../infrastructure/llm/llm.service';
import { LangfuseService } from '../../infrastructure/llm/langfuse.service';

/**
 * Pattern 4: AI as Error Handler
 *
 * In this pattern, AI analyzes errors and decides on recovery strategy.
 * Instead of simple retry with exponential backoff, AI can:
 * - Modify input and try again
 * - Decide that retry doesn't make sense (skip)
 * - Escalate to human when problem is unusual
 *
 * Key elements:
 * - Error analysis - AI understands error context
 * - Adaptive retry - can modify input before retry
 * - Hard limits - AI cannot retry forever
 * - Audit trail - every decision logged to Langfuse
 */

// Possible recovery actions
export type RecoveryAction = 'retry' | 'retry_modified' | 'skip' | 'escalate';

// Schema for recovery decision
const RecoveryDecisionSchema = z.object({
  action: z.enum(['retry', 'retry_modified', 'skip', 'escalate']),
  reason: z.string(),
  modifiedInput: z.unknown().optional(),
  suggestedDelay: z.number().optional(), // in seconds
  humanMessage: z.string().optional(), // message for human on escalation
});

export type RecoveryDecision = z.infer<typeof RecoveryDecisionSchema>;

// Attempt history - needed for context
export interface RetryAttempt {
  attemptNumber: number;
  error: string;
  input: unknown;
  timestamp: Date;
}

// Configuration for smart retry
export interface SmartRetryConfig {
  maxAttempts: number;
  jobType: string; // e.g., 'extraction', 'classification'
}

const DEFAULT_CONFIG: SmartRetryConfig = {
  maxAttempts: 3,
  jobType: 'unknown',
};

const ERROR_HANDLER_PROMPT = `You are an error recovery AI. Analyze the error and previous attempts to decide the best recovery strategy.

Available actions:
1. RETRY: Try again with the same input (for transient errors like timeouts, rate limits)
2. RETRY_MODIFIED: Modify the input and try again (for input-related errors)
3. SKIP: Don't retry, mark as failed (for unrecoverable errors)
4. ESCALATE: Send to human review (for complex/unusual errors)

Decision guidelines:
- Transient errors (timeout, 429, 503): RETRY with delay
- JSON parse errors: RETRY_MODIFIED - simplify prompt or input
- Validation errors: RETRY_MODIFIED - try to fix the input
- Auth errors (401, 403): ESCALATE - needs human intervention
- Unknown/unusual errors: ESCALATE after 2+ attempts
- Same error repeated 3+ times: SKIP or ESCALATE

If suggesting RETRY_MODIFIED, provide the modified input in modifiedInput field.
If suggesting ESCALATE, provide a clear humanMessage explaining the issue.

Return JSON:
{
  "action": "retry" | "retry_modified" | "skip" | "escalate",
  "reason": "Brief explanation of your decision",
  "modifiedInput": <optional, for retry_modified>,
  "suggestedDelay": <optional, seconds to wait before retry>,
  "humanMessage": <optional, for escalate>
}`;

@Injectable()
export class SmartRetryService {
  private readonly logger = new Logger(SmartRetryService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly langfuse: LangfuseService,
  ) {}

  /**
   * Main method - analyzes error and returns recovery decision.
   *
   * @param error - current error
   * @param currentInput - input that caused the error
   * @param history - history of previous attempts
   * @param config - configuration (max attempts, job type)
   */
  async analyzeAndDecide(
    error: Error,
    currentInput: unknown,
    history: RetryAttempt[],
    config: Partial<SmartRetryConfig> = {},
  ): Promise<RecoveryDecision> {
    const { maxAttempts, jobType } = { ...DEFAULT_CONFIG, ...config };
    const attemptNumber = history.length + 1;
    const jobId = `retry-analysis-${Date.now()}`;

    // Hard limit - don't ask AI if max attempts exceeded
    if (attemptNumber > maxAttempts) {
      this.logger.warn(
        `Max attempts (${maxAttempts}) exceeded for ${jobType}, forcing skip`,
      );

      return {
        action: 'skip',
        reason: `Exceeded maximum retry attempts (${maxAttempts})`,
      };
    }

    const trace = this.langfuse.createTrace(jobId, 'error-recovery');
    trace.update({
      metadata: {
        jobType,
        attemptNumber,
        errorType: error.name,
        errorMessage: error.message,
      },
    });

    try {
      // Prepare context for AI
      const context = this.buildContext(error, currentInput, history, jobType);

      // Error analysis - use cheaper model (classify task)
      // as this is mainly pattern matching on error types
      const decision = await this.llm.completeWithSchema<RecoveryDecision>(
        {
          model: this.llm.getModelForTask('classify'),
          system: ERROR_HANDLER_PROMPT,
          messages: [
            {
              role: 'user',
              content: context,
            },
          ],
        },
        { jobId, step: 'error-analysis' },
        RecoveryDecisionSchema,
      );

      // Log decision
      trace.update({
        output: {
          decision: decision.action,
          reason: decision.reason,
        },
      });

      // AUDIT LOG
      this.logger.log(`\n${'='.repeat(50)}`);
      this.logger.log(`[AUDIT] Error Recovery for ${jobType}`);
      this.logger.log(`${'='.repeat(50)}`);

      this.logger.log(`\n>>> ERROR CONTEXT:`);
      this.logger.log(`Type: ${error.name}`);
      this.logger.log(`Message: ${error.message}`);
      this.logger.log(`Attempt: ${attemptNumber}/${maxAttempts}`);

      if (history.length > 0) {
        this.logger.log(`\n>>> PREVIOUS ATTEMPTS:`);
        history.forEach((h, i) => {
          this.logger.log(`  ${i + 1}. ${h.error}`);
        });
      }

      this.logger.log(`\n>>> LLM DECISION:`);
      this.logger.log(JSON.stringify(decision, null, 2));

      this.logger.log(`\n${'='.repeat(50)}\n`);

      await this.langfuse.flush();
      return decision;
    } catch (analysisError) {
      // If error handler itself fails - fallback to simple retry or skip
      const err = analysisError as Error;
      this.logger.error(`Error analysis failed: ${err.message}`, err.stack);

      trace.update({
        output: { error: err.message, status: 'ERROR' },
      });

      await this.langfuse.flush();

      // Fallback: retry if early attempts, skip if many attempts already
      return attemptNumber < maxAttempts
        ? { action: 'retry', reason: 'Error analysis failed, simple retry' }
        : {
            action: 'skip',
            reason: 'Error analysis failed and max attempts near',
          };
    }
  }

  /**
   * Builds context for AI - summarizes error and attempt history.
   */
  private buildContext(
    error: Error,
    currentInput: unknown,
    history: RetryAttempt[],
    jobType: string,
  ): string {
    const sections: string[] = [
      `Job Type: ${jobType}`,
      `Current Attempt: ${history.length + 1}`,
      '',
      '=== CURRENT ERROR ===',
      `Type: ${error.name}`,
      `Message: ${error.message}`,
      '',
      '=== CURRENT INPUT (summarized) ===',
      this.summarizeInput(currentInput),
    ];

    if (history.length > 0) {
      sections.push('', '=== PREVIOUS ATTEMPTS ===');

      history.forEach((attempt, idx) => {
        sections.push(
          `\nAttempt ${idx + 1}:`,
          `  Error: ${attempt.error}`,
          `  Input changed: ${this.didInputChange(attempt.input, currentInput)}`,
        );
      });
    }

    return sections.join('\n');
  }

  /**
   * Summarizes input to avoid sending too many tokens.
   */
  private summarizeInput(input: unknown): string {
    if (input === null || input === undefined) {
      return '(empty)';
    }

    const str = JSON.stringify(input);

    // Trim to 500 characters
    if (str.length > 500) {
      return str.substring(0, 500) + '... (truncated)';
    }

    return str;
  }

  /**
   * Checks if input changed between attempts.
   */
  private didInputChange(oldInput: unknown, newInput: unknown): string {
    const oldStr = JSON.stringify(oldInput);
    const newStr = JSON.stringify(newInput);
    return oldStr === newStr ? 'no' : 'yes';
  }

  /**
   * Helper: executes recovery decision.
   * Returns modified input or null if no retry.
   */
  async executeDecision(
    decision: RecoveryDecision,
    originalInput: unknown,
    onEscalate?: (message: string) => Promise<void>,
  ): Promise<{ shouldRetry: boolean; input: unknown; delay?: number }> {
    switch (decision.action) {
      case 'retry':
        return {
          shouldRetry: true,
          input: originalInput,
          delay: decision.suggestedDelay,
        };

      case 'retry_modified':
        return {
          shouldRetry: true,
          input: decision.modifiedInput ?? originalInput,
          delay: decision.suggestedDelay,
        };

      case 'skip':
        this.logger.log(`Skipping retry: ${decision.reason}`);
        return { shouldRetry: false, input: originalInput };

      case 'escalate':
        this.logger.warn(`Escalating to human: ${decision.humanMessage}`);
        if (onEscalate && decision.humanMessage) {
          await onEscalate(decision.humanMessage);
        }
        return { shouldRetry: false, input: originalInput };

      default:
        return { shouldRetry: false, input: originalInput };
    }
  }
}
