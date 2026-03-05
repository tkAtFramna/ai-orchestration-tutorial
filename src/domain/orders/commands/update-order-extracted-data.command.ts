export class UpdateOrderExtractedDataCommand {
  constructor(
    public readonly orderId: string,
    public readonly extractedData: Record<string, unknown>,
  ) {}
}
