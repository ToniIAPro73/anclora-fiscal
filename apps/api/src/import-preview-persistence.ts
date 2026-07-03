import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import type { ImportPreviewResponse } from './import-service';

export interface ImportPreviewRepositoryPort {
  persist(input: {
    tenantId: string;
    jobId: string;
    connectorId: string;
    importerVersion: string;
    originalNameEncrypted: string;
    evidence: ImportPreviewResponse['evidence'];
    summary: Record<string, unknown>;
    issues: ImportPreviewResponse['issues'];
  }): Promise<{ jobId: string; duplicate: boolean }>;
}

export interface ImportPreviewPersistencePort {
  persist(tenantId: string, filename: string, preview: ImportPreviewResponse): Promise<{ jobId: string; duplicate: boolean }>;
}

export class ImportMetadataCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32) throw new Error('IMPORT_METADATA_SECRET debe contener al menos 32 caracteres');
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
  }
}

const IMPORTER_VERSIONS: Record<ImportPreviewResponse['connector'], string> = {
  'shopify-csv': 'shopify-csv@0.1.0',
  'shopify-pdf': 'shopify-pdf@0.1.0',
  'kdp-xlsx': 'kdp-xlsx@0.1.0',
};

export class ImportPreviewPersistenceService implements ImportPreviewPersistencePort {
  constructor(
    private readonly repository: ImportPreviewRepositoryPort,
    private readonly cipher: ImportMetadataCipher,
  ) {}

  persist(tenantId: string, filename: string, preview: ImportPreviewResponse): Promise<{ jobId: string; duplicate: boolean }> {
    return this.repository.persist({
      tenantId,
      jobId: preview.jobId,
      connectorId: preview.connector,
      importerVersion: IMPORTER_VERSIONS[preview.connector],
      originalNameEncrypted: this.cipher.encrypt(filename),
      evidence: preview.evidence,
      summary: preview.summary,
      issues: preview.issues,
    });
  }
}
