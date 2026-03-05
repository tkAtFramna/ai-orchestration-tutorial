import { OrderStatus } from '../order.entity';

export class UpdateOrderStatusCommand {
  constructor(
    public readonly orderId: string,
    public readonly status: OrderStatus,
  ) {}
}
