# AI Integration Patterns in Orchestration Systems

This directory contains implementations of 4 AI integration patterns for orchestration systems. Each pattern demonstrates a different approach to using LLMs in event-driven architecture.

## Quick Start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Set environment variables
export ANTHROPIC_API_KEY=your-key
export LANGFUSE_PUBLIC_KEY=your-key
export LANGFUSE_SECRET_KEY=your-key
export LANGFUSE_HOST=http://localhost:3000

# 3. Start application
npm run start:dev

# 4. Open Swagger UI
open http://localhost:3001/api
```

---

## Pattern 1: AI as Executor

**Location:** `executor/extract-order.processor.ts`

### Concept

AI performs a **specific task** without making business decisions. It acts as an "intelligent parser" - receives unstructured input and returns data conforming to a schema.

```
┌─────────────┐     ┌─────────┐     ┌──────────────┐
│  Raw Text   │ ──► │   LLM   │ ──► │ Structured   │
│  (email)    │     │ (haiku) │     │ JSON + Zod   │
└─────────────┘     └─────────┘     └──────────────┘
```

### When to Use

- Data extraction from unstructured sources
- Parsing documents, emails, logs
- Format conversion (natural language → JSON)

### Key Elements

| Element | Description |
|---------|-------------|
| **Zod Schema** | Strict validation - don't trust LLM output blindly |
| **Confidence Score** | Enables routing: high → auto-process, low → human review |
| **Cheap Model** | Haiku is sufficient for simple structural tasks |

### Usage

```typescript
// Add job to extraction queue
await extractionQueue.add('extract', {
  orderId: 'uuid-of-order-entity',
  rawText: `
    Order from John Smith
    - 2x Laptop Dell XPS 15 @ $2500
    - 1x Monitor 27" @ $500
    Total: $5500
  `,
});
```

### Output

```json
{
  "orderId": null,
  "customerName": "John Smith",
  "items": [
    { "name": "Laptop Dell XPS 15", "quantity": 2, "price": 2500 },
    { "name": "Monitor 27\"", "quantity": 1, "price": 500 }
  ],
  "total": 5500,
  "confidence": 0.95
}
```

---

## Pattern 2: AI as Decider

**Location:** `decider/classify-ticket.processor.ts`

### Concept

AI **makes decisions** based on context and defined rules. Unlike Executor, here LLM chooses among options, not just parses data.

```
┌─────────────┐     ┌─────────┐     ┌─────────────┐     ┌──────────────┐
│   Ticket    │ ──► │   MCP   │ ──► │     LLM     │ ──► │   Decision   │
│   Content   │     │ Context │     │  (sonnet)   │     │   + Route    │
└─────────────┘     └─────────┘     └─────────────┘     └──────────────┘
```

### When to Use

- Classification and routing
- Prioritization
- Strategy/action selection
- Decisions requiring context

### Key Elements

| Element | Description |
|---------|-------------|
| **MCP Context** | Context enrichment with customer data before decision |
| **Enum Validation** | AI must choose from allowed values list |
| **Fallback Strategy** | Safe defaults when LLM fails |
| **Expensive Model** | Sonnet for better reasoning |

### Usage

```typescript
await classificationQueue.add('classify', {
  ticketId: 'uuid-of-ticket',
  content: 'My package did not arrive. I ordered 3 days ago. Status shows "shipped" but nothing came.',
  customerId: 'CUST-100',
});
```

### Output

```json
{
  "category": "shipping",
  "priority": "high",
  "department": "logistics",
  "reasoning": "Customer reports missing package. Gold tier customer warrants elevated priority."
}
```

### Allowed Values

```typescript
category:   'billing' | 'technical' | 'shipping' | 'general'
priority:   'low' | 'medium' | 'high' | 'urgent'
department: 'support' | 'sales' | 'logistics' | 'engineering'
```

---

## Pattern 3: AI as Supervisor

**Location:** `supervisor/quality-check.service.ts`

### Concept

AI acts as a **supervisor** - periodically reviews results from other systems (including other AIs) and looks for anomalies.

```
┌─────────────┐     ┌─────────────┐     ┌─────────┐     ┌─────────────┐
│  Cron Job   │ ──► │ Batch Data  │ ──► │   LLM   │ ──► │   Alerts    │
│  (5 min)    │     │ (20 orders) │     │ (haiku) │     │   (Slack)   │
└─────────────┘     └─────────────┘     └─────────┘     └─────────────┘
```

### When to Use

- Quality assurance of automated processes
- Anomaly and fraud detection
- Auditing other AI outputs
- Batch process monitoring

### Key Elements

| Element | Description |
|---------|-------------|
| **Scheduled Execution** | Cron job, not event-driven |
| **Batch Processing** | Multiple records in single LLM call |
| **Data Summarization** | Data compression before sending |
| **Alerting** | Escalation of critical issues |

### Automatic Execution

Service runs automatically every 5 minutes via `@Cron`:

```typescript
@Cron(CronExpression.EVERY_5_MINUTES)
async runScheduledCheck(): Promise<void> {
  await this.checkRecentOrders();
}
```

### Manual Invocation

```typescript
// Inject service
constructor(private qualityCheck: QualityCheckService) {}

// Call manually (e.g., via API endpoint)
const result = await this.qualityCheck.checkRecentOrders();
```

### Output

```json
{
  "flaggedOrders": [
    {
      "orderId": "abc-123",
      "issue": "suspicious_total",
      "severity": "high",
      "explanation": "Sum of items (500) doesn't match total (5000)"
    }
  ],
  "summary": "1 of 20 orders flagged for review",
  "totalChecked": 20
}
```

### Issue Types

```typescript
'suspicious_total'       // Sum doesn't match items
'missing_critical_data'  // Missing key fields
'low_confidence'         // Confidence < 0.6
'unusual_pattern'        // Unusual pattern
'potential_fraud'        // Suspected fraud
```

---

## Pattern 4: AI as Error Handler

**Location:** `error-handler/smart-retry.service.ts`

### Concept

AI **analyzes errors** and decides on recovery strategy. Instead of simple retry with exponential backoff, AI can modify input or escalate to human.

```
┌─────────────┐     ┌─────────────┐     ┌─────────┐     ┌──────────────┐
│    Error    │ ──► │   History   │ ──► │   LLM   │ ──► │   Decision   │
│  + Context  │     │  + Input    │     │ (haiku) │     │ retry/skip/  │
└─────────────┘     └─────────────┘     └─────────┘     │   escalate   │
                                                        └──────────────┘
```

### When to Use

- Error handling in job processors
- Intelligent retry with input modification
- Escalation of unusual problems
- Adaptive error handling

### Key Elements

| Element | Description |
|---------|-------------|
| **Error Analysis** | AI understands error context |
| **Adaptive Retry** | Can modify input before retry |
| **Hard Limits** | Max 3 attempts - AI cannot retry forever |
| **Escalation** | Handoff to human with explanation |

### Usage in Processor

```typescript
@Processor('my-queue')
export class MyProcessor extends WorkerHost {
  private retryHistory: RetryAttempt[] = [];

  constructor(private smartRetry: SmartRetryService) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      return await this.doWork(job.data);
    } catch (error) {
      // Record attempt in history
      this.retryHistory.push({
        attemptNumber: this.retryHistory.length + 1,
        error: error.message,
        input: job.data,
        timestamp: new Date(),
      });

      // Ask AI for decision
      const decision = await this.smartRetry.analyzeAndDecide(
        error,
        job.data,
        this.retryHistory,
        { maxAttempts: 3, jobType: 'my-processor' },
      );

      // Execute decision
      const result = await this.smartRetry.executeDecision(
        decision,
        job.data,
        async (msg) => this.notifyHuman(msg), // escalation callback
      );

      if (result.shouldRetry) {
        // Retry with (potentially modified) input
        if (result.delay) await this.sleep(result.delay * 1000);
        return this.process({ ...job, data: result.input });
      }

      throw error; // Skip or escalate - no retry
    }
  }
}
```

### Possible Decisions

| Action | When | What it does |
|--------|------|--------------|
| `retry` | Transient errors (timeout, 429) | Retries with same input |
| `retry_modified` | Input-related errors | Retries with modified input |
| `skip` | Unrecoverable errors | Ends without retry |
| `escalate` | Complex/unusual errors | Hands off to human |

---

## Token Optimization

All patterns apply token optimization:

### 1. Model Selection

```typescript
// llm.service.ts
const MODEL_BY_TASK = {
  classify: 'claude-3-5-haiku-latest',   // Cheap - simple tasks
  extract: 'claude-3-5-haiku-latest',    // Cheap - structural
  decide: 'claude-3-5-sonnet-latest',    // Expensive - requires reasoning
  summarize: 'claude-3-5-haiku-latest',  // Cheap - compression
};
```

### 2. Context Trimming

```typescript
// Pattern 2: Limit order history
const ordersData = await this.mcp.callTool('orders', 'getCustomerOrders', {
  customerId,
  limit: 5, // Only last 5 orders
});
```

### 3. Batch Processing

```typescript
// Pattern 3: Multiple records in single call
const BATCH_SIZE = 20;
const orders = await this.queryBus.execute(
  new GetRecentOrdersQuery(BATCH_SIZE),
);
```

### 4. Data Summarization

```typescript
// Pattern 3: Compression before sending
private summarizeForReview(orders: Order[]): string {
  return orders.map((order) => ({
    id: order.id,
    confidence: extracted?.confidence,
    // Only fields needed for quality check
  }));
}
```

---

## Langfuse Tracing

Every pattern logs to Langfuse with correlation ID:

```typescript
// Job ID = Trace ID
const trace = this.langfuse.createTrace(job.id, 'pattern-name');

// Metadata
trace.update({
  metadata: { orderId, customerId },
  output: { result, confidence },
});
```

**Dashboard:** http://localhost:3000 (after starting docker-compose)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        app.module.ts                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  LlmModule   │  │  McpModule   │  │ QueueModule  │          │
│  │  (Anthropic) │  │  (MCP SDK)   │  │  (BullMQ)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    PatternsModule                        │   │
│  │  ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌─────────────┐  │   │
│  │  │Executor │ │ Decider │ │Supervisor │ │ErrorHandler │  │   │
│  │  │(Queue)  │ │(Queue)  │ │  (Cron)   │ │ (Service)   │  │   │
│  │  └─────────┘ └─────────┘ └───────────┘ └─────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Domain Layer                           │  │
│  │  ┌─────────────────┐        ┌─────────────────┐          │  │
│  │  │  OrdersModule   │        │  TicketsModule  │          │  │
│  │  │  (CQRS)         │        │  (Service)      │          │  │
│  │  └─────────────────┘        └─────────────────┘          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing

### Via Swagger UI

Open http://localhost:3001/api and use the interactive documentation.

### Via Command Line

```bash
# Unit tests
npm run test

# E2E tests (requires running infrastructure)
npm run test:e2e
```

### Manual Test via REPL

```bash
npm run start -- --entryFile repl
```

```typescript
// In REPL or via endpoint
const queue = app.get(getQueueToken('extraction'));
await queue.add('test', {
  orderId: 'test-123',
  rawText: 'Order from John: 2x Widget at $50 each. Total: $100',
});
```
