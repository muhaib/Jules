import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { env } from '@/lib/env';

export type StoredObject = {
  key: string;
  size: number;
  checksum: string;
};

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Removes every object under a key prefix. Used when a tenant's data is purged. */
  deletePrefix(prefix: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Local filesystem driver (default; suitable for single-node deployments)
// ---------------------------------------------------------------------------

class LocalDriver implements StorageDriver {
  private root = path.resolve(process.cwd(), env().STORAGE_LOCAL_DIR);

  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    // Defence in depth: a crafted key must never escape the storage root.
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error('Invalid storage key');
    }
    return target;
  }

  async put(key: string, body: Buffer) {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }

  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async deletePrefix(prefix: string) {
    const target = this.resolve(prefix);
    // Never allow a prefix that resolves to the storage root itself.
    if (target === this.root) throw new Error('Refusing to delete the entire storage root');

    let count = 0;
    try {
      const entries = await fs.readdir(target, { recursive: true, withFileTypes: true });
      count = entries.filter((e) => e.isFile()).length;
    } catch {
      return 0;
    }
    await fs.rm(target, { recursive: true, force: true });
    return count;
  }
}

// ---------------------------------------------------------------------------
// S3-compatible driver (AWS S3, Cloudflare R2, MinIO, …)
//
// The AWS SDK is imported lazily so deployments using local storage do not need
// the dependency installed at all.
// ---------------------------------------------------------------------------

class S3Driver implements StorageDriver {
  private clientPromise: Promise<any> | null = null;

  private get bucket() {
    const bucket = env().S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET must be set when STORAGE_DRIVER=s3');
    return bucket;
  }

  private client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = await import(/* webpackIgnore: true */ '@aws-sdk/client-s3' as string).catch(
          () => {
            throw new Error(
              'STORAGE_DRIVER=s3 requires @aws-sdk/client-s3. Install it with: npm i @aws-sdk/client-s3',
            );
          },
        );
        const e = env();
        return {
          mod,
          s3: new mod.S3Client({
            region: e.S3_REGION,
            ...(e.S3_ENDPOINT ? { endpoint: e.S3_ENDPOINT } : {}),
            forcePathStyle: e.S3_FORCE_PATH_STYLE,
            ...(e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
              ? {
                  credentials: {
                    accessKeyId: e.S3_ACCESS_KEY_ID,
                    secretAccessKey: e.S3_SECRET_ACCESS_KEY,
                  },
                }
              : {}),
          }),
        };
      })();
    }
    return this.clientPromise;
  }

  async put(key: string, body: Buffer, contentType: string) {
    const { mod, s3 } = await this.client();
    await s3.send(
      new mod.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string) {
    const { mod, s3 } = await this.client();
    const res = await s3.send(new mod.GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async delete(key: string) {
    const { mod, s3 } = await this.client();
    await s3.send(new mod.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string) {
    const { mod, s3 } = await this.client();
    try {
      await s3.send(new mod.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async deletePrefix(prefix: string) {
    if (!prefix || prefix === '/') throw new Error('Refusing to delete the entire bucket');
    const { mod, s3 } = await this.client();

    let removed = 0;
    let token: string | undefined;
    do {
      const page = await s3.send(
        new mod.ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix.endsWith('/') ? prefix : `${prefix}/`,
          ContinuationToken: token,
        }),
      );
      const keys = (page.Contents ?? []).map((o: { Key: string }) => ({ Key: o.Key }));
      if (keys.length > 0) {
        // DeleteObjects accepts at most 1000 keys per request.
        for (let i = 0; i < keys.length; i += 1000) {
          await s3.send(
            new mod.DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: keys.slice(i, i + 1000) },
            }),
          );
        }
        removed += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return removed;
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (!driver) driver = env().STORAGE_DRIVER === 's3' ? new S3Driver() : new LocalDriver();
  return driver;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};

export const ALLOWED_MIME = Object.keys(EXT_BY_MIME);

/**
 * Stores an evidence file exactly as captured. Photos are deliberately NOT
 * re-encoded or downscaled: evidence quality is the point of the record.
 */
export async function storeEvidence(
  organizationId: string,
  scope: string,
  buffer: Buffer,
  mimeType: string,
): Promise<StoredObject> {
  const ext = EXT_BY_MIME[mimeType] ?? 'bin';
  const now = new Date();
  const key = [
    'orgs',
    organizationId,
    scope,
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    `${randomUUID()}.${ext}`,
  ].join('/');

  await storage().put(key, buffer, mimeType);

  return {
    key,
    size: buffer.byteLength,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  };
}
