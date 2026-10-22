import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

export const CODE = '123456';

export async function startApp(
  url: string,
  customise: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<{ app: NestExpressApplication; pool: Pool }> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = 'j'.repeat(40);
  process.env.OTP_SECRET = 'o'.repeat(40);
  process.env.DEV_FIXED_OTP = CODE;
  process.env.OTP_RESEND_SECONDS = '30';
  const pool = new Pool({ connectionString: url });
  const moduleRef = await customise(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return { app, pool };
}

export async function signIn(app: NestExpressApplication, pool: Pool, phone: string): Promise<string> {
  const http = request(app.getHttpServer());
  // Pretend an earlier code was asked a while ago so the resend wait never blocks a test.
  await pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes' where phone_e164 = $1`, [phone]);
  await http.post('/v1/auth/otp/request').send({ phone }).expect(200);
  const response = await http.post('/v1/auth/otp/verify').send({ phone, code: CODE }).expect(200);
  return response.body.token as string;
}
