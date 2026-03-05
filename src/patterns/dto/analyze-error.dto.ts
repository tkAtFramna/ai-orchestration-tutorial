import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Example errors for testing different recovery scenarios
 */
export const ERROR_EXAMPLES = {
  timeout_error: {
    summary: 'Timeout Error (should retry)',
    value: {
      errorMessage: 'Request timeout after 30000ms',
      errorName: 'TimeoutError',
      input: { orderId: 'order-001', text: 'Order from John Smith...' },
      jobType: 'extraction',
      history: [],
    },
  },
  rate_limit: {
    summary: 'Rate Limit (should retry with delay)',
    value: {
      errorMessage: '429 Too Many Requests - Rate limit exceeded',
      errorName: 'RateLimitError',
      input: { ticketId: 'ticket-001', content: 'My package never arrived!' },
      jobType: 'classification',
      history: [],
    },
  },
  auth_error: {
    summary: 'Auth Error (should escalate)',
    value: {
      errorMessage: '401 Unauthorized - Invalid API key',
      errorName: 'AuthenticationError',
      input: { orderId: 'order-002', text: 'Some order...' },
      jobType: 'extraction',
      history: [],
    },
  },
  json_parse_error: {
    summary: 'JSON Parse Error (should retry_modified)',
    value: {
      errorMessage: 'JSON parse error: Unexpected token at position 42',
      errorName: 'SyntaxError',
      input: {
        orderId: 'order-003',
        text: 'Messy order with special chars: {{{',
      },
      jobType: 'extraction',
      history: [],
    },
  },
  repeated_failure: {
    summary: 'Repeated Failure (should skip or escalate)',
    value: {
      errorMessage: 'Connection refused',
      errorName: 'ConnectionError',
      input: { orderId: 'order-001', text: 'Order data...' },
      jobType: 'extraction',
      history: [
        {
          attemptNumber: 1,
          error: 'Connection refused',
          input: { orderId: 'order-001', text: 'Order data...' },
          timestamp: '2024-01-01T10:00:00Z',
        },
        {
          attemptNumber: 2,
          error: 'Connection refused',
          input: { orderId: 'order-001', text: 'Order data...' },
          timestamp: '2024-01-01T10:01:00Z',
        },
      ],
    },
  },
};

export class RetryAttemptDto {
  @ApiProperty({ description: 'Attempt number', example: 1 })
  @IsNumber()
  attemptNumber: number;

  @ApiProperty({
    description: 'Error message from this attempt',
    example: 'Timeout',
  })
  @IsString()
  error: string;

  @ApiProperty({ description: 'Input used in this attempt', example: {} })
  input: unknown;

  @ApiProperty({
    description: 'Timestamp of attempt',
    example: '2024-01-01T00:00:00Z',
  })
  @IsDateString()
  timestamp: string;
}

export class AnalyzeErrorDto {
  @ApiProperty({
    description: 'Error message',
    example: 'Request timeout after 30000ms',
  })
  @IsString()
  @IsNotEmpty()
  errorMessage: string;

  @ApiPropertyOptional({
    description: 'Error type',
    example: 'TimeoutError',
  })
  @IsString()
  @IsOptional()
  errorName?: string;

  @ApiProperty({
    description: 'Input that caused the error',
    example: { orderId: '123', text: 'some order data' },
  })
  @IsNotEmpty()
  input: unknown;

  @ApiPropertyOptional({
    description: 'History of previous attempts',
    type: [RetryAttemptDto],
    example: [
      {
        attemptNumber: 1,
        error: 'Timeout',
        input: {},
        timestamp: '2024-01-01T00:00:00Z',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RetryAttemptDto)
  @IsOptional()
  history?: RetryAttemptDto[];

  @ApiPropertyOptional({
    description: 'Job type (for context)',
    example: 'extraction',
  })
  @IsString()
  @IsOptional()
  jobType?: string;
}
