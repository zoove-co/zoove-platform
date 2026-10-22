import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

import { APP_CONFIG, type Env } from '../config/env';

// Protects sensitive numbers (PAN) in the database. A leaked table is useless without PII_SECRET.
@Injectable()
export class PiiService {
  private readonly key: Buffer;
  private readonly hashKey: string;

  constructor(@Inject(APP_CONFIG) config: Env) {
    // Development and tests fall back to a fixed secret. Production refuses to start without PII_SECRET (env.ts).
    const secret = config.PII_SECRET ?? 'development-only-pii-secret-not-for-production';
    this.key = createHash('sha256').update(`enc:${secret}`).digest();
    this.hashKey = `hash:${secret}`;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64')).join('.');
  }

  decrypt(stored: string): string {
    const [iv, tag, body] = stored.split('.').map((part) => Buffer.from(part, 'base64')) as [Buffer, Buffer, Buffer];
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }

  // Stable fingerprint so the same PAN cannot be used for two applications, without decrypting anything.
  fingerprint(value: string): string {
    return createHmac('sha256', this.hashKey).update(value).digest('hex');
  }
}
