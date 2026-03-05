import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Order, OrderStatus } from '../../order.entity';
import { OrdersRepository } from '../../orders.repository';
import { GetPendingOrdersQuery } from '../get-pending-orders.query';

@QueryHandler(GetPendingOrdersQuery)
export class GetPendingOrdersHandler implements IQueryHandler<GetPendingOrdersQuery> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(query: GetPendingOrdersQuery): Promise<Order[]> {
    const orders = this.ordersRepository
      .findByStatus(OrderStatus.PENDING)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, query.limit);
    return Promise.resolve(orders);
  }
}
