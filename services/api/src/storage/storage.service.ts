// Private file storage. Nothing stored here is ever public: reads use short-lived signed links.
export abstract class StorageService {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract signedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
  abstract remove(key: string): Promise<void>;
}
