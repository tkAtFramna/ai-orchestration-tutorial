import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Mock data - w prawdziwym projekcie to byłoby połączenie z DB
const orders = [
  {
    id: 'ORD-001',
    customerId: 'CUST-100',
    customerName: 'Jan Kowalski',
    items: [
      { name: 'Laptop', quantity: 1, price: 2500 },
      { name: 'Mouse', quantity: 2, price: 50 },
    ],
    total: 2600,
    status: 'completed',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'ORD-002',
    customerId: 'CUST-100',
    customerName: 'Jan Kowalski',
    items: [{ name: 'Keyboard', quantity: 1, price: 150 }],
    total: 150,
    status: 'pending',
    createdAt: '2024-01-20T14:30:00Z',
  },
  {
    id: 'ORD-003',
    customerId: 'CUST-200',
    customerName: 'Anna Nowak',
    items: [
      { name: 'Monitor', quantity: 2, price: 800 },
      { name: 'HDMI Cable', quantity: 2, price: 25 },
    ],
    total: 1650,
    status: 'shipped',
    createdAt: '2024-01-18T09:15:00Z',
  },
];

const customers = [
  {
    id: 'CUST-100',
    name: 'Jan Kowalski',
    email: 'jan@example.com',
    tier: 'gold',
    totalOrders: 15,
    totalSpent: 12500,
  },
  {
    id: 'CUST-200',
    name: 'Anna Nowak',
    email: 'anna@example.com',
    tier: 'silver',
    totalOrders: 5,
    totalSpent: 3200,
  },
];

const server = new McpServer({
  name: 'orders-server',
  version: '1.0.0',
});

// Tool: Get single order by ID
server.tool(
  'getOrder',
  'Retrieves a single order by its ID',
  {
    orderId: z.string().describe('The order ID (e.g., ORD-001)'),
  },
  ({ orderId }) => {
    const order = orders.find((o) => o.id === orderId);
    return {
      content: [
        {
          type: 'text' as const,
          text: order
            ? JSON.stringify(order, null, 2)
            : `Order ${orderId} not found`,
        },
      ],
    };
  },
);

// Tool: Get orders for a customer
server.tool(
  'getCustomerOrders',
  'Retrieves all orders for a specific customer',
  {
    customerId: z.string().describe('The customer ID (e.g., CUST-100)'),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe('Maximum number of orders to return'),
  },
  ({ customerId, limit }) => {
    const customerOrders = orders
      .filter((o) => o.customerId === customerId)
      .slice(0, limit);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(customerOrders, null, 2),
        },
      ],
    };
  },
);

// Tool: Get customer info
server.tool(
  'getCustomer',
  'Retrieves customer information by ID',
  {
    customerId: z.string().describe('The customer ID'),
  },
  ({ customerId }) => {
    const customer = customers.find((c) => c.id === customerId);
    return {
      content: [
        {
          type: 'text' as const,
          text: customer
            ? JSON.stringify(customer, null, 2)
            : `Customer ${customerId} not found`,
        },
      ],
    };
  },
);

// Tool: Update order status
server.tool(
  'updateOrderStatus',
  'Updates the status of an order',
  {
    orderId: z.string().describe('The order ID'),
    status: z
      .enum(['pending', 'processing', 'shipped', 'completed', 'cancelled'])
      .describe('New status'),
  },
  ({ orderId, status }) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      return {
        content: [
          { type: 'text' as const, text: `Order ${orderId} not found` },
        ],
      };
    }
    order.status = status;
    return {
      content: [
        {
          type: 'text' as const,
          text: `Order ${orderId} status updated to ${status}`,
        },
      ],
    };
  },
);
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Orders MCP server running on stdio');
}

main().catch(console.error);
