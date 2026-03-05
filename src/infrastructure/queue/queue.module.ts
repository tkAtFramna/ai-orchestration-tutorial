import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

export const QUEUES = {
  EXTRACTION: 'extraction',
  CLASSIFICATION: 'classification',
  QUALITY_CHECK: 'quality-check',
} as const;

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.EXTRACTION },
      { name: QUEUES.CLASSIFICATION },
      { name: QUEUES.QUALITY_CHECK },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
