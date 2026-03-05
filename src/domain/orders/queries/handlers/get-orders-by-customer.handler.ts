import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Order } from '../../order.entity';
import { OrdersRepository } from '../../orders.repository';
import { GetOrdersByCustomerQuery } from '../get-orders-by-customer.query';

@QueryHandler(GetOrdersByCustomerQuery)
export class GetOrdersByCustomerHandler implements IQueryHandler<GetOrdersByCustomerQuery> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(query: GetOrdersByCustomerQuery): Promise<Order[]> {
    const orders = this.ordersRepository
      .findByCustomerId(query.customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, query.limit);
    return Promise.resolve(orders);
  }
}
