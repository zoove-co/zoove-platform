import { z } from 'zod';

// Every setting the API reads comes through here, validated once at start-up.
// A wrong or missing value stops the process immediately instead of failing later.
const flag = z
  .string()
  .optional()
  .transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: flag,

    JWT_SECRET: z.string().min(32),
    OTP_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),

    OTP_TTL_SECONDS: z.coerce.number().int().min(30).default(5 * 60),
    OTP_RESEND_SECONDS: z.coerce.number().int().min(0).default(30),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    OTP_HOURLY_LIMIT: z.coerce.number().int().min(1).default(5),
    DEV_FIXED_OTP: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),

    SMS_PROVIDER: z.enum(['console']).default('console'),
    CORS_ORIGINS: z.string().default(''),
    SWAGGER_ENABLED: flag,
    TRUST_PROXY: flag,
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.DEV_FIXED_OTP), {
    message: 'DEV_FIXED_OTP must not be set in production',
    path: ['DEV_FIXED_OTP'],
  });

export type Env = z.infer<typeof schema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}
