import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Example orders for testing extraction scenarios
 */
export const EXTRACT_EXAMPLES = {
  complete_order: {
    summary: 'Complete Order (Email)',
    value: {
      orderId: 'order-001',
      rawText: `Order from John Smith
Email: john@example.com

Products:
- 2x Laptop Dell XPS 15 @ $4999
- 1x Logitech MX Master Mouse @ $399
- 3x USB-C Cable @ $29

Total: $10484
Order number: ORD-2024-1234`,
    },
  },
  messy_order: {
    summary: 'Messy Order (Chat Message)',
    value: {
      orderId: 'order-002',
      rawText: `hey i wanna order some stuff
umm like 3 monitors the samsung ones theyre like 450 each i think
oh and a keyboard, mechanical one, around 150
my name is mike johnson btw
can u ship to 123 main st?`,
    },
  },
  partial_order: {
    summary: 'Partial Order (Missing Data)',
    value: {
      orderId: 'order-003',
      rawText: `Quick order:
- Widget Pro x5
- Gadget Plus x2
Ship ASAP please`,
    },
  },
  foreign_order: {
    summary: 'Foreign Language Order',
    value: {
      orderId: 'order-001',
      rawText: `Zamówienie od: Tomasz Kowalski
Produkty:
- 1x iPhone 15 Pro - 5499 PLN
- 2x Etui silikonowe - 99 PLN każde
Razem: 5697 PLN
Numer zamówienia: ZAM-2024-0042`,
    },
  },
};

export class ExtractOrderDto {
  @ApiProperty({
    description: 'Order entity ID in database',
    example: 'order-001',
  })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    description: 'Text to process (email, message, etc.)',
    example: EXTRACT_EXAMPLES.complete_order.value.rawText,
  })
  @IsString()
  @IsNotEmpty()
  rawText: string;
}
