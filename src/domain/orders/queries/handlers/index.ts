import { GetOrderByIdHandler } from './get-order-by-id.handler';
import { GetOrdersByCustomerHandler } from './get-orders-by-customer.handler';
import { GetPendingOrdersHandler } from './get-pending-orders.handler';
import { GetRecentOrdersHandler } from './get-recent-orders.handler';

export const QueryHandlers = [
  GetOrderByIdHandler,
  GetOrdersByCustomerHandler,
  GetPendingOrdersHandler,
  GetRecentOrdersHandler,
];

export {
  GetOrderByIdHandler,
  GetOrdersByCustomerHandler,
  GetPendingOrdersHandler,
  GetRecentOrdersHandler,
};
