import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { OrdersRepository } from './orders.repository';
import { CommandHandlers } from './commands/handlers';
import { QueryHandlers } from './queries/handlers';

@Module({
  imports: [CqrsModule],
  providers: [OrdersRepository, ...CommandHandlers, ...QueryHandlers],
  exports: [CqrsModule, OrdersRepository],
})
export class OrdersModule {}
