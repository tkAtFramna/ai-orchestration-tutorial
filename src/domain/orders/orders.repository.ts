import { Injectable } from '@nestjs/common';
import { Order, OrderStatus } from './order.entity';
import { v4 as uuid } from 'uuid';

@Injectable()
export class OrdersRepository {
  private orders: Map<string, Order> = new Map();

  constructor() {
    // Seed with sample data
    this.seed();
  }

  private seed(): void {
    const sampleOrders: {
      id: string;
      data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>;
    }[] = [
      {
        id: 'order-001',
        data: {
          customerId: 'CUST-100',
          customerName: 'Jan Kowalski',
          items: [
            { name: 'Laptop', quantity: 1, price: 2500 },
            { name: 'Mouse', quantity: 2, price: 50 },
          ],
          total: 2600,
          status: OrderStatus.COMPLETED,
        },
      },
      {
        id: 'order-002',
        data: {
          customerId: 'CUST-100',
          customerName: 'Jan Kowalski',
          items: [{ name: 'Keyboard', quantity: 1, price: 150 }],
          total: 150,
          status: OrderStatus.PENDING,
        },
      },
      {
        id: 'order-003',
        data: {
          customerId: 'CUST-200',
          customerName: 'Anna Nowak',
          items: [
            { name: 'Monitor', quantity: 2, price: 800 },
            { name: 'HDMI Cable', quantity: 2, price: 25 },
          ],
          total: 1650,
          status: OrderStatus.SHIPPED,
        },
      },
    ];

    sampleOrders.forEach(({ id, data }) => this.createWithId(id, data));
  }

  private createWithId(
    id: string,
    data: Omit<Order, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
      status?: OrderStatus;
    },
  ): Order {
    const now = new Date();
    const order: Order = {
      id,
      ...data,
      status: data.status ?? OrderStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    return order;
  }

  create(
    data: Omit<Order, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
      status?: OrderStatus;
    },
  ): Order {
    const now = new Date();
    const order: Order = {
      id: uuid(),
      ...data,
      status: data.status ?? OrderStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    return order;
  }

  findById(id: string): Order | null {
    return this.orders.get(id) ?? null;
  }

  findAll(): Order[] {
    return Array.from(this.orders.values());
  }

  findByCustomerId(customerId: string): Order[] {
    return this.findAll().filter((o) => o.customerId === customerId);
  }

  findByStatus(status: OrderStatus): Order[] {
    return this.findAll().filter((o) => o.status === status);
  }

  findRecent(limit: number): Order[] {
    return this.findAll()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  update(id: string, data: Partial<Order>): Order | null {
    const order = this.orders.get(id);
    if (!order) return null;

    const updated: Order = {
      ...order,
      ...data,
      id: order.id, // prevent id override
      createdAt: order.createdAt, // prevent createdAt override
      updatedAt: new Date(),
    };
    this.orders.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.orders.delete(id);
  }
}
