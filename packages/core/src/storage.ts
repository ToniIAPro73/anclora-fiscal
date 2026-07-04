import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { get as getBlob, put as putBlob } from '@vercel/blob';

export interface StoredObject {
  key: string;
  sha256: string;
  size: number;
  mimeType: string;
}

export interface StoragePort {
  put(input: { tenantId: string; bytes: Uint8Array; mimeType: string }): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
}

export class FilesystemStorage implements StoragePort {
  constructor(private readonly root: string) {}

  async put(input: { tenantId: string; bytes: Uint8Array; mimeType: string }): Promise<StoredObject> {
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const key = join(input.tenantId, `${randomUUID()}-${sha256}`);
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.bytes, { flag: 'wx' });
    return { key, sha256, size: input.bytes.byteLength, mimeType: input.mimeType };
  }

  async get(key: string): Promise<Uint8Array> {
    if (key.includes('..')) throw new Error('Clave de almacenamiento no válida');
    return readFile(join(this.root, key));
  }
}

export interface S3ObjectClient {
  putObject(key: string, body: Uint8Array, mimeType: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
}

export class S3CompatibleStorage implements StoragePort {
  constructor(private readonly client: S3ObjectClient) {}

  async put(input: { tenantId: string; bytes: Uint8Array; mimeType: string }): Promise<StoredObject> {
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const key = `${input.tenantId}/${randomUUID()}-${sha256}`;
    await this.client.putObject(key, input.bytes, input.mimeType);
    return { key, sha256, size: input.bytes.byteLength, mimeType: input.mimeType };
  }

  get(key: string): Promise<Uint8Array> { return this.client.getObject(key); }
}

/**
 * Vercel serverless functions have a read-only filesystem outside `/tmp`, so
 * FilesystemStorage cannot be used in production there — this backs the same
 * StoragePort with Vercel Blob instead. Evidence files may contain real
 * customer/business data, so blobs are always written with `access: 'private'`
 * (requires the read-write token to fetch, never a bare public URL).
 */
export class VercelBlobStorage implements StoragePort {
  async put(input: { tenantId: string; bytes: Uint8Array; mimeType: string }): Promise<StoredObject> {
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const key = join(input.tenantId, `${randomUUID()}-${sha256}`);
    const blob = await putBlob(key, Buffer.from(input.bytes), { access: 'private', contentType: input.mimeType });
    return { key: blob.pathname, sha256, size: input.bytes.byteLength, mimeType: input.mimeType };
  }

  async get(key: string): Promise<Uint8Array> {
    if (key.includes('..')) throw new Error('Clave de almacenamiento no válida');
    const result = await getBlob(key, { access: 'private' });
    if (!result || result.statusCode !== 200) throw new Error('Objeto de almacenamiento no encontrado');
    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
}
