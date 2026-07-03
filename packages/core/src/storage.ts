import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
