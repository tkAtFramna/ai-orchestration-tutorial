import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Order } from '../../order.entity';
import { OrdersRepository } from '../../orders.repository';
import { GetRecentOrdersQuery } from '../get-recent-orders.query';

@QueryHandler(GetRecentOrdersQuery)
export class GetRecentOrdersHandler implements IQueryHandler<GetRecentOrdersQuery> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(query: GetRecentOrdersQuery): Promise<Order[]> {
    return Promise.resolve(this.ordersRepository.findRecent(query.limit));
  }
}
