export class CreateOrderCommand {
  constructor(
    public readonly customerId: string,
    public readonly customerName: string,
    public readonly items: { name: string; quantity: number; price: number }[],
    public readonly total: number,
  ) {}
}
