export enum TicketCategory {
  BILLING = 'billing',
  TECHNICAL = 'technical',
  SHIPPING = 'shipping',
  GENERAL = 'general',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TicketDepartment {
  SUPPORT = 'support',
  SALES = 'sales',
  LOGISTICS = 'logistics',
  ENGINEERING = 'engineering',
}

export enum TicketStatus {
  NEW = 'new',
  CLASSIFIED = 'classified',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
}

export interface Ticket {
  id: string;
  content: string;
  customerId: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  department?: TicketDepartment;
  status: TicketStatus;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
