import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Order } from '../../order.entity';
import { OrdersRepository } from '../../orders.repository';
import { CreateOrderCommand } from '../create-order.command';

@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(command: CreateOrderCommand): Promise<Order> {
    return Promise.resolve(
      this.ordersRepository.create({
        customerId: command.customerId,
        customerName: command.customerName,
        items: command.items,
        total: command.total,
      }),
    );
  }
}
