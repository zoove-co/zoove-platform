import type { ArgumentsHost } from '@nestjs/common';
import { HttpException } from '@nestjs/common';

import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { DomainError } from '../src/common/domain-error';
import { parseEnv } from '../src/config/env';
import type { ErrorReporter } from '../src/monitoring/error-reporter';

function run(exception: unknown) {
  const captured: unknown[] = [];
  const reporter: ErrorReporter = { capture: (error) => void captured.push(error) };
  const res = { statusCode: 0, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(b: unknown) { this.body = b; } };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'GET', path: '/x', user: { id: 'u1' } }) }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter(reporter).catch(exception, host);
  return { res, captured };
}

describe('error monitoring', () => {
  it('reports an unexpected failure and still answers with the generic message', () => {
    const boom = new Error('db exploded');
    const { res, captured } = run(boom);
    expect(captured).toEqual([boom]);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('db exploded');
  });

  it('does not report expected failures', () => {
    expect(run(new DomainError('NOT_FOUND', 'No such thing.')).captured).toHaveLength(0);
    expect(run(new HttpException('nope', 401)).captured).toHaveLength(0);
  });

  it('accepts an empty SENTRY_DSN and rejects a malformed one', () => {
    const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(32), OTP_SECRET: 'b'.repeat(32) };
    expect(parseEnv({ ...base, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
    expect(parseEnv({ ...base, SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1' }).SENTRY_DSN).toContain('sentry.io');
    expect(() => parseEnv({ ...base, SENTRY_DSN: 'not a url' })).toThrow();
  });
});
