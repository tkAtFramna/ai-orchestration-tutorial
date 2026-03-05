import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CqrsModule } from '@nestjs/cqrs';

// Infrastructure
import { LlmModule } from '../infrastructure/llm/llm.module';
import { McpModule } from '../infrastructure/mcp/mcp.module';
import { QueueModule } from '../infrastructure/queue/queue.module';

// Domain
import { OrdersModule } from '../domain/orders/orders.module';
import { TicketsModule } from '../domain/tickets/tickets.module';

// Pattern 1: AI as Executor
import { ExtractOrderProcessor } from './executor/extract-order.processor';

// Pattern 2: AI as Decider
import { ClassifyTicketProcessor } from './decider/classify-ticket.processor';

// Pattern 3: AI as Supervisor
import { QualityCheckService } from './supervisor/quality-check.service';

// Pattern 4: AI as Error Handler
import { SmartRetryService } from './error-handler/smart-retry.service';

// Test Controller
import { PatternsController } from './patterns.controller';

/**
 * PatternsModule - agreguje wszystkie AI integration patterns.
 *
 * Każdy pattern demonstruje inny sposób wykorzystania AI w systemie:
 * 1. Executor - AI wykonuje zadanie (ekstrakcja danych)
 * 2. Decider - AI podejmuje decyzję (klasyfikacja)
 * 3. Supervisor - AI nadzoruje jakość (batch review)
 * 4. Error Handler - AI obsługuje błędy (smart retry)
 *
 * Moduł importuje:
 * - ScheduleModule dla cron jobs (Pattern 3)
 * - CqrsModule dla command/query bus
 * - Infrastrukturę (LLM, MCP, Queue)
 * - Domeny (Orders, Tickets)
 */
@Module({
  imports: [
    // Schedule dla Pattern 3 (Supervisor cron job)
    ScheduleModule.forRoot(),

    // CQRS dla komunikacji z domeną
    CqrsModule,

    // Infrastruktura
    LlmModule,
    McpModule,
    QueueModule,

    // Domeny
    OrdersModule,
    TicketsModule,
  ],
  providers: [
    // Pattern 1: Executor
    ExtractOrderProcessor,

    // Pattern 2: Decider
    ClassifyTicketProcessor,

    // Pattern 3: Supervisor
    QualityCheckService,

    // Pattern 4: Error Handler
    SmartRetryService,
  ],
  controllers: [PatternsController],
  exports: [
    // Export serwisów które mogą być używane przez inne moduły
    QualityCheckService,
    SmartRetryService,
  ],
})
export class PatternsModule {}
