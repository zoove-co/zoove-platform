import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';

import { DomainError } from '../common/domain-error';
import { APP_CONFIG, type Env } from '../config/env';
import { StorageService } from './storage.service';

// Works with Supabase Storage (S3 protocol) today and with AWS S3 later: only the settings change.
@Injectable()
export class S3StorageService extends StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(@Inject(APP_CONFIG) config: Env) {
    super();
    this.bucket = config.S3_BUCKET;
    this.client =
      config.STORAGE_PROVIDER === 's3' && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? new S3Client({
            region: config.S3_REGION,
            ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
            forcePathStyle: config.S3_FORCE_PATH_STYLE,
            credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
          })
        : null;
  }

  private need(): S3Client {
    if (!this.client) throw new DomainError('STORAGE_UNAVAILABLE', 'File storage is not set up yet.');
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.need().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  signedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.need(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async remove(key: string): Promise<void> {
    await this.need().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
