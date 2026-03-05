import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Infrastructure
import { LlmModule } from './infrastructure/llm/llm.module';
import { McpModule } from './infrastructure/mcp/mcp.module';
import { QueueModule } from './infrastructure/queue/queue.module';

// Domain
import { OrdersModule } from './domain/orders/orders.module';
import { TicketsModule } from './domain/tickets/tickets.module';

// Patterns
import { PatternsModule } from './patterns/patterns.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),

    // Infrastructure
    LlmModule,
    McpModule,
    QueueModule,

    // Domain
    OrdersModule,
    TicketsModule,

    // AI Integration Patterns
    PatternsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
