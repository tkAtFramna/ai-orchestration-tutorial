import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Example tickets for testing different classification scenarios
 */
export const CLASSIFY_EXAMPLES = {
  shipping_angry: {
    summary: 'Shipping Issue (Angry Customer)',
    value: {
      ticketId: 'ticket-001',
      content:
        'My package never arrived! I ordered 5 days ago, tracking shows delivered but I got NOTHING. This is the second time this month. I want a refund NOW!',
      customerId: 'CUST-100',
    },
  },
  billing_refund: {
    summary: 'Billing Issue (Refund Request)',
    value: {
      ticketId: 'ticket-002',
      content:
        'I was charged twice for my last order #12345. Please refund the duplicate charge of $299. My credit card statement shows two transactions on the same day.',
      customerId: 'CUST-100',
    },
  },
  technical_bug: {
    summary: 'Technical Issue (Bug Report)',
    value: {
      ticketId: 'ticket-003',
      content:
        'Your app crashes every time I try to checkout. I am on iPhone 15, iOS 18. Error message says "Payment failed" but my card is fine. Tried 3 different browsers.',
      customerId: 'CUST-200',
    },
  },
  general_question: {
    summary: 'General Question',
    value: {
      ticketId: 'ticket-004',
      content:
        'Hi, I was wondering if you offer gift wrapping for orders? I want to send a birthday present to my friend. Also, do you ship to Canada?',
      customerId: 'CUST-200',
    },
  },
};

export class ClassifyTicketDto {
  @ApiProperty({
    description: 'Ticket ID to classify',
    example: 'ticket-001',
  })
  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @ApiProperty({
    description: 'Support ticket content',
    example: CLASSIFY_EXAMPLES.shipping_angry.value.content,
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Customer ID (for fetching context via MCP)',
    example: 'CUST-100',
  })
  @IsString()
  @IsNotEmpty()
  customerId: string;
}
