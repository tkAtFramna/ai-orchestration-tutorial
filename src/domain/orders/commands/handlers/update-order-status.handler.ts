import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Order } from '../../order.entity';
import { OrdersRepository } from '../../orders.repository';
import { UpdateOrderStatusCommand } from '../update-order-status.command';

@CommandHandler(UpdateOrderStatusCommand)
export class UpdateOrderStatusHandler implements ICommandHandler<UpdateOrderStatusCommand> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(command: UpdateOrderStatusCommand): Promise<Order> {
    const order = this.ordersRepository.update(command.orderId, {
      status: command.status,
    });

    if (!order) {
      throw new NotFoundException(`Order ${command.orderId} not found`);
    }

    return Promise.resolve(order);
  }
}
