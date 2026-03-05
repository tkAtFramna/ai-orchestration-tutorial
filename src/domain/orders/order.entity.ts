export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface OrderItem {
  name: string;
  quantity: number | null;
  price: number | null;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  extractedData?: Record<string, unknown>;
  classification?: string;
  createdAt: Date;
  updatedAt: Date;
}
