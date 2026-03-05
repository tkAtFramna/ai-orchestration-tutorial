import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LangfuseService } from './langfuse.service';

export interface CompletionParams {
  model?: string;
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
}

export interface CompletionContext {
  jobId: string;
  step: string;
}

const MODEL_BY_TASK = {
  classify: 'claude-3-haiku-20240307',
  extract: 'claude-3-haiku-20240307',
  decide: 'claude-3-haiku-20240307',
  summarize: 'claude-3-haiku-20240307',
} as const;

@Injectable()
export class LlmService {
  private client: Anthropic;

  constructor(private langfuse: LangfuseService) {
    this.client = new Anthropic();
  }

  getModelForTask(task: keyof typeof MODEL_BY_TASK): string {
    return MODEL_BY_TASK[task];
  }

  async complete(
    params: CompletionParams,
    context: CompletionContext,
  ): Promise<Anthropic.Message> {
    const model = params.model ?? MODEL_BY_TASK.extract;
    const trace = this.langfuse.createTrace(context.jobId, context.step);

    const generation = trace.generation({
      name: context.step,
      model,
      input: {
        system: params.system,
        messages: params.messages,
      },
    });

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: params.maxTokens ?? 1024,
        system: params.system,
        messages: params.messages,
        tools: params.tools,
      });

      generation.end({
        output: response.content,
        usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
      });

      await this.langfuse.flush();
      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      generation.end({
        output: { error: errorMessage },
      });
      await this.langfuse.flush();
      throw error;
    }
  }

  async completeWithSchema<T>(
    params: CompletionParams,
    context: CompletionContext,
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    const response = await this.complete(
      {
        ...params,
        messages: [
          ...params.messages,
          {
            role: 'user' as const,
            content:
              'Respond with valid JSON only. No markdown, no explanation.',
          },
        ],
      },
      context,
    );

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from LLM');
    }

    const parsed: unknown = JSON.parse(textBlock.text);
    return schema.parse(parsed);
  }
}
