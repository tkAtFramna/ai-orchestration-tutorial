import { CreateOrderHandler } from './create-order.handler';
import { UpdateOrderStatusHandler } from './update-order-status.handler';
import { UpdateOrderExtractedDataHandler } from './update-order-extracted-data.handler';
import { UpdateOrderClassificationHandler } from './update-order-classification.handler';

export const CommandHandlers = [
  CreateOrderHandler,
  UpdateOrderStatusHandler,
  UpdateOrderExtractedDataHandler,
  UpdateOrderClassificationHandler,
];

export {
  CreateOrderHandler,
  UpdateOrderStatusHandler,
  UpdateOrderExtractedDataHandler,
  UpdateOrderClassificationHandler,
};
