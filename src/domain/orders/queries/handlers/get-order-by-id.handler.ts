import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Order } from '../../order.entity';
import { OrdersRepository } from '../../orders.repository';
import { GetOrderByIdQuery } from '../get-order-by-id.query';

@QueryHandler(GetOrderByIdQuery)
export class GetOrderByIdHandler implements IQueryHandler<GetOrderByIdQuery> {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(query: GetOrderByIdQuery): Promise<Order | null> {
    return Promise.resolve(this.ordersRepository.findById(query.orderId));
  }
}
