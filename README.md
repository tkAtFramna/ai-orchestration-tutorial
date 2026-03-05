# AI Orchestration Patterns Tutorial

A NestJS-based tutorial demonstrating 4 AI integration patterns for orchestration systems using Anthropic Claude and Model Context Protocol (MCP).

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Anthropic API key

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Get your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys** in the left panel
4. Click **Create Key** and copy it (starts with `sk-ant-...`)
5. Add a payment method in **Billing** (required for API access)

### 3. Set up environment variables

Create a `.env` file in the project root:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Optional: Langfuse (LLM observability)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=http://localhost:3000
```

### 4. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **Redis** (port 6379) - for BullMQ job queue
- **Langfuse** (port 3000) - for LLM tracing/observability
- **PostgreSQL** - only for Langfuse internal storage

### 5. Run the application

```bash
npm run start:dev
```

### 6. Open Swagger UI

Navigate to [http://localhost:3001/api](http://localhost:3001/api) to test the AI patterns.

## AI Integration Patterns

| Pattern | Endpoint | Description |
|---------|----------|-------------|
| **Executor** | `POST /patterns/extract` | AI performs data extraction without making decisions |
| **Decider** | `POST /patterns/classify` | AI makes classification decisions using context from MCP |
| **Supervisor** | `POST /patterns/quality-check` | AI reviews and validates other systems' outputs |
| **Error Handler** | `POST /patterns/analyze-error` | AI decides recovery strategy for failed operations |

### Pattern 1: AI as Executor

The AI extracts structured data from unstructured text. No business decisions - just parsing.

```bash
curl -X POST http://localhost:3001/patterns/extract \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-001",
    "rawText": "Order from John Smith\nEmail: john@example.com\n\nProducts:\n- 2x Laptop @ $999\n- 1x Mouse @ $29\n\nTotal: $2027"
  }'
```

### Pattern 2: AI as Decider

The AI classifies support tickets using customer context fetched via MCP tools.

```bash
curl -X POST http://localhost:3001/patterns/classify \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "ticket-001",
    "content": "My package never arrived! This is the second time this month!",
    "customerId": "CUST-100"
  }'
```

### Pattern 3: AI as Supervisor

The AI reviews recent orders for anomalies (runs automatically every 5 minutes via cron, or manually via API).

```bash
curl -X POST http://localhost:3001/patterns/quality-check
```

### Pattern 4: AI as Error Handler

The AI analyzes errors and decides on recovery strategy (retry, modify input, skip, or escalate).

```bash
curl -X POST http://localhost:3001/patterns/analyze-error \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Request timeout after 30000ms",
    "errorName": "TimeoutError",
    "input": {"orderId": "123"},
    "jobType": "extraction"
  }'
```

## Langfuse Setup (Optional)

Langfuse provides observability for LLM calls - traces, costs, latency.

1. After `docker compose up -d`, go to [http://localhost:3000](http://localhost:3000)
2. Create an account (local only, data stays in Docker)
3. Create a new project
4. Go to **Settings > API Keys** and create keys
5. Add the keys to your `.env` file

## Project Structure

```
src/
├── infrastructure/
│   ├── llm/          # Anthropic Claude wrapper + Langfuse tracing
│   ├── mcp/          # MCP client for tool integration
│   └── queue/        # BullMQ job queue setup
│
├── domain/
│   ├── orders/       # Order domain with CQRS (in-memory storage)
│   └── tickets/      # Ticket domain (in-memory storage)
│
├── patterns/
│   ├── executor/     # Pattern 1: extract-order.processor.ts
│   ├── decider/      # Pattern 2: classify-ticket.processor.ts
│   ├── supervisor/   # Pattern 3: quality-check.service.ts
│   └── error-handler/# Pattern 4: smart-retry.service.ts
│
└── mcp-servers/
    └── orders/       # MCP server with mock customer data
```

## Tech Stack

- **NestJS** - Framework
- **Anthropic Claude** - LLM (Haiku for simple tasks, Sonnet for decisions)
- **MCP** - Model Context Protocol for tool integration
- **BullMQ** - Job queue for async processing
- **Zod** - LLM output validation
- **Langfuse** - LLM observability
- **Swagger** - API documentation

## License

MIT
