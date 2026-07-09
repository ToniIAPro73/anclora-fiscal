import { createHash } from 'node:crypto';

export interface VerifactuRecordInput { documentId: string; documentNumber: string; recordType: 'ALTA' | 'ANULACION'; issuedAt: string; totalAmount: number; taxAmount: number; previousHash?: string; }
export interface IntegrityRecord extends VerifactuRecordInput { canonicalPayload: string; hash: string; algorithm: 'SHA-256'; createdAt: string; }

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function createIntegrityRecord(input: VerifactuRecordInput, createdAt: string): IntegrityRecord {
  const canonicalPayload = canonicalize({ ...input, previousHash: input.previousHash ?? null });
  return { ...input, canonicalPayload, hash: createHash('sha256').update(canonicalPayload).digest('hex'), algorithm: 'SHA-256', createdAt };
}

export function verifyIntegrityChain(records: IntegrityRecord[]): boolean {
  return records.every((record, index) => {
    const expectedPrevious = index === 0 ? undefined : records[index - 1]?.hash;
    const rebuilt = createIntegrityRecord({ documentId: record.documentId, documentNumber: record.documentNumber, recordType: record.recordType, issuedAt: record.issuedAt, totalAmount: record.totalAmount, taxAmount: record.taxAmount, ...(record.previousHash ? { previousHash: record.previousHash } : {}) }, record.createdAt);
    return record.previousHash === expectedPrevious && rebuilt.hash === record.hash;
  });
}

export type VerifactuMode = 'disabled' | 'mock' | 'sandbox' | 'production';

export interface VerifactuRuntimeConfig {
  mode: VerifactuMode;
  enabled: boolean;
  canSubmit: boolean;
  productionSafe: boolean;
}

export interface VerifactuSubmissionResult {
  status: 'ACCEPTED' | 'REJECTED';
  reference: string;
  message: string;
}

export interface VerifactuPort {
  submit(record: IntegrityRecord): Promise<VerifactuSubmissionResult>;
}

export function resolveVerifactuRuntimeConfig(input: {
  mode?: string | undefined;
  enabled?: string | boolean | undefined;
  nodeEnv?: string | undefined;
}): VerifactuRuntimeConfig {
  const explicitMode = input.mode?.trim().toLowerCase();
  const legacyEnabled = input.enabled === true || input.enabled === 'true';

  const mode: VerifactuMode =
    explicitMode === 'mock' || explicitMode === 'sandbox' || explicitMode === 'production' || explicitMode === 'disabled'
      ? explicitMode
      : legacyEnabled
        ? 'mock'
        : 'disabled';

  const isProductionRuntime = input.nodeEnv === 'production';

  if (mode === 'mock' && isProductionRuntime) {
    throw new Error('VERIFACTU_MOCK_NOT_ALLOWED_IN_PRODUCTION');
  }

  if (mode === 'production') {
    return {
      mode,
      enabled: true,
      canSubmit: false,
      productionSafe: false,
    };
  }

  if (mode === 'sandbox') {
    return {
      mode,
      enabled: true,
      canSubmit: false,
      productionSafe: true,
    };
  }

  if (mode === 'mock') {
    return {
      mode,
      enabled: true,
      canSubmit: true,
      productionSafe: !isProductionRuntime,
    };
  }

  return {
    mode: 'disabled',
    enabled: false,
    canSubmit: false,
    productionSafe: true,
  };
}

export class MockVerifactuAdapter implements VerifactuPort {
  constructor(private readonly config: VerifactuRuntimeConfig) {}

  async submit(record: IntegrityRecord): Promise<VerifactuSubmissionResult> {
    if (!this.config.enabled || !this.config.canSubmit) {
      throw new Error('VERIFACTU_NOT_ENABLED');
    }

    if (this.config.mode !== 'mock') {
      throw new Error('VERIFACTU_MOCK_ADAPTER_REQUIRES_MOCK_MODE');
    }

    if (!this.config.productionSafe) {
      throw new Error('VERIFACTU_MOCK_NOT_ALLOWED_IN_PRODUCTION');
    }

    return record.totalAmount < 0
      ? {
          status: 'REJECTED',
          reference: `mock-${record.hash.slice(0, 12)}`,
          message: 'Rechazo simulado para validar el flujo de revisión',
        }
      : {
          status: 'ACCEPTED',
          reference: `mock-${record.hash.slice(0, 12)}`,
          message: 'Aceptación simulada; no se ha contactado con la AEAT',
        };
  }
}
