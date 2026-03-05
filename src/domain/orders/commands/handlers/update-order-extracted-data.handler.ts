import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Order, OrderItem } from '../../order.entity';
import { OrdersRepository } from '../../orders.repository';
import { UpdateOrderExtractedDataCommand } from '../update-order-extracted-data.command';

@CommandHandler(UpdateOrderExtractedDataCommand)
export class UpdateOrderExtractedDataHandler implements ICommandHandler<UpdateOrderExtractedDataCommand> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(command: UpdateOrderExtractedDataCommand): Promise<Order> {
    const extracted = command.extractedData as {
      customerName?: string | null;
      items?: OrderItem[] | null;
      total?: number | null;
    };

    // Update order fields with extracted data (only non-null values)
    // Also store extractedData for Pattern 3 (Supervisor) quality checks
    const order = this.ordersRepository.update(command.orderId, {
      ...(extracted.customerName && { customerName: extracted.customerName }),
      ...(extracted.items && { items: extracted.items }),
      ...(extracted.total && { total: extracted.total }),
      extractedData: command.extractedData,
    });

    if (!order) {
      throw new NotFoundException(`Order ${command.orderId} not found`);
    }

    return Promise.resolve(order);
  }
}
