export class GetOrdersByCustomerQuery {
  constructor(
    public readonly customerId: string,
    public readonly limit: number = 10,
  ) {}
}
