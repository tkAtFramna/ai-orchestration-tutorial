import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const MCP_SERVERS: Record<string, McpServerConfig> = {
  orders: {
    command: 'npx',
    args: ['ts-node', 'src/mcp-servers/orders/index.ts'],
  },
  // Add more servers here:
  // slack: {
  //   command: 'npx',
  //   args: ['-y', '@modelcontextprotocol/server-slack'],
  //   env: { SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN },
  // },
};

@Injectable()
export class McpClientService implements OnModuleInit, OnModuleDestroy {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();

  async onModuleInit() {
    for (const [name, config] of Object.entries(MCP_SERVERS)) {
      await this.connectServer(name, config);
    }
  }

  async onModuleDestroy() {
    for (const [name, client] of this.clients) {
      await client.close();
      console.log(`Disconnected from MCP server: ${name}`);
    }
  }

  private async connectServer(name: string, config: McpServerConfig) {
    try {
      // Filter out undefined values from process.env
      const cleanEnv = Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined),
      ) as Record<string, string>;

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...cleanEnv, ...config.env },
      });

      const client = new Client(
        { name: `nest-client-${name}`, version: '1.0.0' },
        { capabilities: {} },
      );

      await client.connect(transport);

      this.clients.set(name, client);
      this.transports.set(name, transport);

      console.log(`Connected to MCP server: ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to connect to MCP server ${name}:`, message);
    }
  }

  async listTools(serverName: string): Promise<Anthropic.Tool[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} not connected`);
    }

    const { tools } = await client.listTools();

    // Convert MCP tools to Anthropic tool format
    return tools.map((tool) => ({
      name: `${serverName}__${tool.name}`,
      description: tool.description || '',
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} not connected`);
    }

    const result = await client.callTool({ name: toolName, arguments: args });

    // Extract text content from result (cast to expected MCP content structure)
    const content = (
      result as { content: Array<{ type: string; text?: string }> }
    ).content;
    const textContent = content.find(
      (c: { type: string }) => c.type === 'text',
    );
    if (textContent && textContent.text) {
      return textContent.text;
    }

    return JSON.stringify(content);
  }

  // Helper: Get all tools from all connected servers
  async getAllTools(): Promise<Anthropic.Tool[]> {
    const allTools: Anthropic.Tool[] = [];

    for (const serverName of this.clients.keys()) {
      const tools = await this.listTools(serverName);
      allTools.push(...tools);
    }

    return allTools;
  }

  // Helper: Parse tool name and call appropriate server
  async callToolByFullName(
    fullName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const [serverName, toolName] = fullName.split('__');
    if (!serverName || !toolName) {
      throw new Error(`Invalid tool name format: ${fullName}`);
    }
    return this.callTool(serverName, toolName, args);
  }
}
