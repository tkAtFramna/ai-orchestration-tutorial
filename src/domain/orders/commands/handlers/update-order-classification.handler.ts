import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Order } from '../../order.entity';
import { OrdersRepository } from '../../orders.repository';
import { UpdateOrderClassificationCommand } from '../update-order-classification.command';

@CommandHandler(UpdateOrderClassificationCommand)
export class UpdateOrderClassificationHandler implements ICommandHandler<UpdateOrderClassificationCommand> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(command: UpdateOrderClassificationCommand): Promise<Order> {
    const order = this.ordersRepository.update(command.orderId, {
      classification: command.classification,
    });

    if (!order) {
      throw new NotFoundException(`Order ${command.orderId} not found`);
    }

    return Promise.resolve(order);
  }
}
