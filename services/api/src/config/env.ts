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

    SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_TEMPLATE_ID: z.string().optional(),

    // Email: console prints messages to the log (development). resend sends real mail.
    EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    EMAIL_FROM: z.string().default('Zoove <hello@zoove.co>'),
    RESEND_API_KEY: z.string().optional(),
    // Where "new trainer application" alerts go (comma separated). Optional.
    OPS_NOTIFY_EMAILS: z.string().default(''),
    // Link used inside emails to open the admin panel and the trainer status page.
    ADMIN_URL: z.string().default('http://localhost:3002'),
    TRAINER_SITE_URL: z.string().default('http://localhost:3001'),
    EMAIL_WORKER_ENABLED: z
      .string()
      .optional()
      .transform((value) => value !== 'false'),

    // Private file storage for KYC documents. S3 compatible: Supabase Storage now, AWS S3 later (same code).
    // none = uploads are refused with STORAGE_UNAVAILABLE.
    STORAGE_PROVIDER: z.enum(['none', 's3']).default('none'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('ap-south-1'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_BUCKET: z.string().default('trainer-docs'),
    S3_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .transform((value) => value !== 'false'),

    // Encrypts PAN numbers in the database. At least 32 characters, different from the other secrets.
    PII_SECRET: z.string().min(32).optional(),
    CORS_ORIGINS: z.string().default(''),
    SWAGGER_ENABLED: flag,
    TRUST_PROXY: flag,
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.DEV_FIXED_OTP), {
    message: 'DEV_FIXED_OTP must not be set in production',
    path: ['DEV_FIXED_OTP'],
  })
  // The console provider prints every OTP into the logs. Production needs a real SMS provider.
  .refine((env) => !(env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'console'), {
    message: 'SMS_PROVIDER=console must not be used in production (it logs every OTP)',
    path: ['SMS_PROVIDER'],
  })
  .refine((env) => env.SMS_PROVIDER !== 'msg91' || Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID), {
    message: 'MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required when SMS_PROVIDER=msg91',
    path: ['SMS_PROVIDER'],
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.EMAIL_PROVIDER === 'console'), {
    message: 'EMAIL_PROVIDER=console sends no real email; use resend in production',
    path: ['EMAIL_PROVIDER'],
  })
  .refine((env) => env.EMAIL_PROVIDER !== 'resend' || Boolean(env.RESEND_API_KEY), {
    message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
    path: ['RESEND_API_KEY'],
  })
  .refine((env) => env.NODE_ENV !== 'production' || Boolean(env.PII_SECRET), {
    message: 'PII_SECRET is required in production (it encrypts PAN numbers)',
    path: ['PII_SECRET'],
  })
  .refine((env) => env.STORAGE_PROVIDER !== 's3' || Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY), {
    message: 'S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_PROVIDER=s3',
    path: ['STORAGE_PROVIDER'],
  })
  .refine((env) => env.PII_SECRET === undefined || (env.PII_SECRET !== env.JWT_SECRET && env.PII_SECRET !== env.OTP_SECRET), {
    message: 'PII_SECRET must differ from JWT_SECRET and OTP_SECRET',
    path: ['PII_SECRET'],
  })
  .refine((env) => env.JWT_SECRET !== env.OTP_SECRET, {
    message: 'JWT_SECRET and OTP_SECRET must be different values',
    path: ['OTP_SECRET'],
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
