import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../infrastructure/queue/queue.module';
import { QualityCheckService } from './supervisor/quality-check.service';
import { SmartRetryService } from './error-handler/smart-retry.service';
import { ExtractOrderDto, ClassifyTicketDto, AnalyzeErrorDto } from './dto';
import { EXTRACT_EXAMPLES } from './dto/extract.dto';
import { CLASSIFY_EXAMPLES } from './dto/classify.dto';
import { ERROR_EXAMPLES } from './dto/analyze-error.dto';

/**
 * Controller for testing patterns.
 * In production, these endpoints would be secured or removed.
 */
@ApiTags('patterns')
@Controller('patterns')
export class PatternsController {
  constructor(
    @InjectQueue(QUEUES.EXTRACTION) private extractionQueue: Queue,
    @InjectQueue(QUEUES.CLASSIFICATION) private classificationQueue: Queue,
    private qualityCheckService: QualityCheckService,
    private smartRetryService: SmartRetryService,
  ) {}

  /**
   * Pattern 1: AI as Executor
   */
  @Post('extract')
  @ApiOperation({
    summary: 'Pattern 1: AI as Executor',
    description: `AI performs a specific task (data extraction) without making business decisions.

LLM acts as an "intelligent parser" - receives unstructured text and returns data conforming to Zod schema.

**Key elements:**
- Strict schema validation (Zod)
- Confidence score for human-in-the-loop
- Cheap model (Haiku) for simple tasks`,
  })
  @ApiBody({
    type: ExtractOrderDto,
    examples: EXTRACT_EXAMPLES,
  })
  @ApiResponse({ status: 201, description: 'Job added to extraction queue' })
  async testExtraction(@Body() dto: ExtractOrderDto) {
    const job = await this.extractionQueue.add('extract', {
      orderId: dto.orderId,
      rawText: dto.rawText,
    });

    return {
      message: 'Extraction job queued',
      jobId: job.id,
      pattern: 'AI as Executor',
    };
  }

  /**
   * Pattern 2: AI as Decider
   */
  @Post('classify')
  @ApiOperation({
    summary: 'Pattern 2: AI as Decider',
    description: `AI makes decisions based on context and defined rules.

**Unlike Executor:** here LLM chooses among options, not just parses data.

**Flow:**
1. Fetch customer context via MCP (getCustomer, getCustomerOrders)
2. LLM classifies ticket
3. Validate values are from allowed list
4. Fallback to defaults if LLM fails

**Allowed values:**
- category: billing | technical | shipping | general
- priority: low | medium | high | urgent
- department: support | sales | logistics | engineering`,
  })
  @ApiBody({
    type: ClassifyTicketDto,
    examples: CLASSIFY_EXAMPLES,
  })
  @ApiResponse({
    status: 201,
    description: 'Job added to classification queue',
  })
  async testClassification(@Body() dto: ClassifyTicketDto) {
    const job = await this.classificationQueue.add('classify', {
      ticketId: dto.ticketId,
      content: dto.content,
      customerId: dto.customerId,
    });

    return {
      message: 'Classification job queued',
      jobId: job.id,
      pattern: 'AI as Decider',
    };
  }

  /**
   * Pattern 3: AI as Supervisor
   */
  @Post('quality-check')
  @ApiOperation({
    summary: 'Pattern 3: AI as Supervisor',
    description: `AI acts as supervisor - reviews results from other systems and looks for anomalies.

**Normally:** runs automatically every 5 minutes (@Cron)

**This endpoint:** invokes manually for testing

**What it checks:**
- Sum of items vs total (suspicious_total)
- Missing fields (missing_critical_data)
- Low confidence < 0.6 (low_confidence)
- Unusual patterns (unusual_pattern)
- Suspected fraud (potential_fraud)

**Token optimization:** Batch processing - 20 orders in single LLM call`,
  })
  @ApiResponse({
    status: 201,
    description: 'Quality check completed',
    schema: {
      type: 'object',
      properties: {
        flaggedOrders: { type: 'array' },
        summary: { type: 'string' },
        totalChecked: { type: 'number' },
      },
    },
  })
  async testQualityCheck() {
    const result = await this.qualityCheckService.checkRecentOrders();

    return {
      message: 'Quality check completed',
      pattern: 'AI as Supervisor',
      result,
    };
  }

  /**
   * Pattern 4: AI as Error Handler
   */
  @Post('analyze-error')
  @ApiOperation({
    summary: 'Pattern 4: AI as Error Handler',
    description: `AI analyzes errors and decides on recovery strategy.

**Possible actions:**
- **retry** - Retry with same input (transient errors: timeout, 429, 503)
- **retry_modified** - Retry with modified input (JSON parse errors, validation errors)
- **skip** - Don't retry (unrecoverable errors)
- **escalate** - Hand off to human (auth errors, complex/unusual errors)

**Hard limit:** Max 3 attempts - AI cannot retry forever`,
  })
  @ApiBody({
    type: AnalyzeErrorDto,
    examples: ERROR_EXAMPLES,
  })
  @ApiResponse({
    status: 201,
    description: 'Recovery decision',
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['retry', 'retry_modified', 'skip', 'escalate'],
        },
        reason: { type: 'string' },
        modifiedInput: { type: 'object' },
        suggestedDelay: { type: 'number' },
        humanMessage: { type: 'string' },
      },
    },
  })
  async testErrorHandler(@Body() dto: AnalyzeErrorDto) {
    const error = new Error(dto.errorMessage);
    error.name = dto.errorName || 'Error';

    const history = (dto.history || []).map((h) => ({
      ...h,
      timestamp: new Date(h.timestamp),
    }));

    const decision = await this.smartRetryService.analyzeAndDecide(
      error,
      dto.input,
      history,
      { maxAttempts: 3, jobType: dto.jobType || 'test' },
    );

    return {
      message: 'Error analysis completed',
      pattern: 'AI as Error Handler',
      decision,
    };
  }

  /**
   * Health check
   */
  @Get('health')
  @ApiOperation({
    summary: 'Health Check',
    description: 'Check BullMQ queue status',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        queues: {
          type: 'object',
          properties: {
            extraction: {
              type: 'object',
              properties: { jobCount: { type: 'number' } },
            },
            classification: {
              type: 'object',
              properties: { jobCount: { type: 'number' } },
            },
          },
        },
      },
    },
  })
  async healthCheck() {
    const [extractionCount, classificationCount] = await Promise.all([
      this.extractionQueue.count(),
      this.classificationQueue.count(),
    ]);

    return {
      status: 'ok',
      queues: {
        extraction: { jobCount: extractionCount },
        classification: { jobCount: classificationCount },
      },
    };
  }
}
