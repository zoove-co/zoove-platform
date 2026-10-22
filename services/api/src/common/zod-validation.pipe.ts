import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { DomainError } from './domain-error';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new DomainError('INVALID_REQUEST', 'The request is not valid.', {
        issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    return result.data;
  }
}
