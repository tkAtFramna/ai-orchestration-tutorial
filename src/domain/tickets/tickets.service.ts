import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  Ticket,
  TicketCategory,
  TicketPriority,
  TicketDepartment,
  TicketStatus,
} from './ticket.entity';

export interface ClassificationResult {
  category: TicketCategory;
  priority: TicketPriority;
  department: TicketDepartment;
}

@Injectable()
export class TicketsService {
  private tickets: Map<string, Ticket> = new Map();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const now = new Date();
    const sampleTickets: Ticket[] = [
      {
        id: 'ticket-001',
        content: 'My package never arrived!',
        customerId: 'CUST-100',
        status: TicketStatus.NEW,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ticket-002',
        content: 'I was charged twice for my order',
        customerId: 'CUST-100',
        status: TicketStatus.NEW,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ticket-003',
        content: 'App crashes on checkout',
        customerId: 'CUST-200',
        status: TicketStatus.NEW,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ticket-004',
        content: 'Do you offer gift wrapping?',
        customerId: 'CUST-200',
        status: TicketStatus.NEW,
        createdAt: now,
        updatedAt: now,
      },
    ];

    sampleTickets.forEach((ticket) => this.tickets.set(ticket.id, ticket));
  }

  create(data: { content: string; customerId: string }): Ticket {
    const now = new Date();
    const ticket: Ticket = {
      id: uuid(),
      content: data.content,
      customerId: data.customerId,
      status: TicketStatus.NEW,
      createdAt: now,
      updatedAt: now,
    };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  findById(id: string): Ticket | null {
    return this.tickets.get(id) ?? null;
  }

  updateClassification(
    id: string,
    classification: ClassificationResult,
  ): Ticket | null {
    const ticket = this.tickets.get(id);
    if (!ticket) return null;

    const updated: Ticket = {
      ...ticket,
      ...classification,
      status: TicketStatus.CLASSIFIED,
      updatedAt: new Date(),
    };
    this.tickets.set(id, updated);
    return updated;
  }

  updateStatus(id: string, status: TicketStatus): Ticket | null {
    const ticket = this.tickets.get(id);
    if (!ticket) return null;

    const updated: Ticket = {
      ...ticket,
      status,
      updatedAt: new Date(),
    };
    this.tickets.set(id, updated);
    return updated;
  }

  findByStatus(status: TicketStatus, limit = 50): Ticket[] {
    return Array.from(this.tickets.values())
      .filter((t) => t.status === status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }

  findRecent(limit = 50): Ticket[] {
    return Array.from(this.tickets.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
