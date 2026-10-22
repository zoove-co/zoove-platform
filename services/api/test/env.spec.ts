import { parseEnv } from '../src/config/env';

const base = {
  DATABASE_URL: 'postgresql://localhost/zoove',
  JWT_SECRET: 'j'.repeat(32),
  OTP_SECRET: 'o'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.OTP_MAX_ATTEMPTS).toBe(5);
    expect(env.DATABASE_SSL).toBe(false);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('reads flags and numbers from strings', () => {
    const env = parseEnv({ ...base, PORT: '8080', DATABASE_SSL: 'true', TRUST_PROXY: 'true' });
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_SSL).toBe(true);
    expect(env.TRUST_PROXY).toBe(true);
  });

  it('rejects short secrets', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('requires a database url', () => {
    expect(() => parseEnv({ JWT_SECRET: base.JWT_SECRET, OTP_SECRET: base.OTP_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('refuses a fixed OTP in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', DEV_FIXED_OTP: '123456' })).toThrow(/DEV_FIXED_OTP/);
    expect(parseEnv({ ...base, NODE_ENV: 'development', DEV_FIXED_OTP: '123456' }).DEV_FIXED_OTP).toBe('123456');
  });

  it('refuses the console SMS provider in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', SMS_PROVIDER: 'console' })).toThrow(/SMS_PROVIDER/);
    expect(parseEnv({ ...base, NODE_ENV: 'development' }).SMS_PROVIDER).toBe('console');
  });

  it('refuses the same value for both secrets', () => {
    const same = 's'.repeat(32);
    expect(() => parseEnv({ ...base, JWT_SECRET: same, OTP_SECRET: same })).toThrow(/different/);
  });
});
