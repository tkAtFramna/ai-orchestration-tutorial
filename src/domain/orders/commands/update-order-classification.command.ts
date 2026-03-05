export class UpdateOrderClassificationCommand {
  constructor(
    public readonly orderId: string,
    public readonly classification: string,
  ) {}
}
