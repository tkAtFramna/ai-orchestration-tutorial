import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Langfuse, LangfuseTraceClient } from 'langfuse';

@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private client: Langfuse;

  constructor() {
    this.client = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_HOST,
    });
  }

  createTrace(jobId: string, name: string): LangfuseTraceClient {
    return this.client.trace({
      id: jobId,
      name,
      metadata: {
        service: 'ai-orchestration-tutorial',
      },
    });
  }

  async flush(): Promise<void> {
    await this.client.flushAsync();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.shutdownAsync();
  }
}
