import { Module, Global } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LangfuseService } from './langfuse.service';

@Global()
@Module({
  providers: [LlmService, LangfuseService],
  exports: [LlmService, LangfuseService],
})
export class LlmModule {}
