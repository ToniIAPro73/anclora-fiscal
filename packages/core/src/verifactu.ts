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

/**
 * Runtime modes:
 * - disabled: no VERI*FACTU flow.
 * - mock: local simulator only; never allowed in production.
 * - test: real AEAT external testing environment once an AEAT adapter exists.
 * - production: real AEAT production environment once a production adapter exists.
 *
 * Legacy alias:
 * - sandbox is accepted as an alias for test to avoid breaking existing env values.
 */
export type VerifactuMode = 'disabled' | 'mock' | 'test' | 'production';

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

export interface VerifactuSubmissionExecutionContext {
  officialAeat?: OfficialAeatBillingRecordRedacted | undefined;
}

export interface VerifactuPort {
  submit(
    record: IntegrityRecord,
    context?: VerifactuSubmissionExecutionContext,
  ): Promise<VerifactuSubmissionResult>;
}


export type VerifactuSubmissionEnvironment = 'mock' | 'test' | 'production';

export type VerifactuSubmissionStatus =
  | 'PENDING'
  | 'SENT'
  | 'ACCEPTED'
  | 'ACCEPTED_WITH_ERRORS'
  | 'REJECTED'
  | 'TECHNICAL_ERROR'
  | 'RETRY_SCHEDULED'
  | 'BLOCKED';

export interface OfficialAeatBillingRecordRedacted {
  schemaVersion: 'anclora-aeat-official-billing-record-redacted-v1';
  legalEntityId: string;
  softwareInstallationNumber: string;
  idEmisorFactura: string;
  numSerieFactura: string;
  fechaExpedicionFactura: string;
  tipoFactura: string;
  huella: string;
  huellaGeneratedAt: string;
  previousHuella: string | null;
  previousFiscalDocumentId: string | null;
  previousIdEmisorFactura?: string | null | undefined;
  previousNumSerieFactura?: string | null | undefined;
  previousFechaExpedicionFactura?: string | null | undefined;
}

export interface VerifactuPayloadRedacted {
  schemaVersion: 'anclora-verifactu-payload-redacted-v1';
  environment: VerifactuSubmissionEnvironment;
  recordType: IntegrityRecord['recordType'];
  documentNumber: string;
  documentHash: string;
  chainHash: string;
  previousHash: string | null;
  issuedAt: string;
  totalAmount: number;
  taxAmount: number;
  algorithm: IntegrityRecord['algorithm'];
  officialAeat?: OfficialAeatBillingRecordRedacted | undefined;
}

export interface VerifactuSubmissionDraft {
  environment: VerifactuSubmissionEnvironment;
  status: VerifactuSubmissionStatus;
  payloadRedacted: VerifactuPayloadRedacted;
  responseRedacted: null;
  attemptCount: 0;
  canSubmit: boolean;
  blockReason?: 'VERIFACTU_DISABLED' | 'VERIFACTU_PRODUCTION_ADAPTER_NOT_CONFIGURED';
}

function resolveSubmissionEnvironment(mode: VerifactuMode): VerifactuSubmissionEnvironment {
  if (mode === 'production') return 'production';
  if (mode === 'test') return 'test';
  return 'mock';
}

export function createVerifactuSubmissionDraft(
  record: IntegrityRecord,
  config: VerifactuRuntimeConfig,
): VerifactuSubmissionDraft {
  const environment = resolveSubmissionEnvironment(config.mode);

  const payloadRedacted: VerifactuPayloadRedacted = {
    schemaVersion: 'anclora-verifactu-payload-redacted-v1',
    environment,
    recordType: record.recordType,
    documentNumber: record.documentNumber,
    documentHash: record.hash,
    chainHash: record.hash,
    previousHash: record.previousHash ?? null,
    issuedAt: record.issuedAt,
    totalAmount: record.totalAmount,
    taxAmount: record.taxAmount,
    algorithm: record.algorithm,
  };

  if (!config.enabled || config.mode === 'disabled') {
    return {
      environment,
      status: 'BLOCKED',
      payloadRedacted,
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: false,
      blockReason: 'VERIFACTU_DISABLED',
    };
  }

  if (config.mode === 'production' && !config.canSubmit) {
    return {
      environment,
      status: 'BLOCKED',
      payloadRedacted,
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: false,
      blockReason: 'VERIFACTU_PRODUCTION_ADAPTER_NOT_CONFIGURED',
    };
  }

  return {
    environment,
    status: 'PENDING',
    payloadRedacted,
    responseRedacted: null,
    attemptCount: 0,
    canSubmit: config.canSubmit,
  };
}

function normalizeVerifactuMode(rawMode: string | undefined, legacyEnabled: boolean): VerifactuMode {
  const explicitMode = rawMode?.trim().toLowerCase();

  if (explicitMode === 'disabled') return 'disabled';
  if (explicitMode === 'mock') return 'mock';
  if (explicitMode === 'test' || explicitMode === 'sandbox') return 'test';
  if (explicitMode === 'production') return 'production';

  return legacyEnabled ? 'mock' : 'disabled';
}

export function resolveVerifactuRuntimeConfig(input: {
  mode?: string | undefined;
  enabled?: string | boolean | undefined;
  nodeEnv?: string | undefined;
  adapterConfigured?: boolean | undefined;
  productionSubmissionEnabled?: boolean | undefined;
}): VerifactuRuntimeConfig {
  const legacyEnabled = input.enabled === true || input.enabled === 'true';
  const mode = normalizeVerifactuMode(input.mode, legacyEnabled);
  const isProductionRuntime = input.nodeEnv === 'production';

  if (mode === 'mock' && isProductionRuntime) {
    throw new Error('VERIFACTU_MOCK_NOT_ALLOWED_IN_PRODUCTION');
  }

  if (mode === 'production') {
    const canSubmit = Boolean(input.adapterConfigured && input.productionSubmissionEnabled);
    return {
      mode,
      enabled: true,
      canSubmit,
      productionSafe: canSubmit,
    };
  }

  if (mode === 'test') {
    return {
      mode,
      enabled: true,
      canSubmit: Boolean(input.adapterConfigured),
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


export type AeatVerifactuEnvironment = 'test' | 'production';

export interface AeatVerifactuSignedPayload {
  signedXml: string;
  signatureDigest: string;
  certificateFingerprint: string;
}

export interface AeatVerifactuTransportRequest {
  environment: AeatVerifactuEnvironment;
  endpointUrl: string;
  record: IntegrityRecord;
  signedPayload: AeatVerifactuSignedPayload;
}

export interface AeatVerifactuTransportResponse {
  status: VerifactuSubmissionResult['status'];
  reference: string;
  message: string;
}

export interface AeatVerifactuSignerPort {
  sign(record: IntegrityRecord): Promise<AeatVerifactuSignedPayload>;
}

export interface AeatVerifactuTransportPort {
  submit(request: AeatVerifactuTransportRequest): Promise<AeatVerifactuTransportResponse>;
}

export interface AeatVerifactuAdapterOptions {
  environment: AeatVerifactuEnvironment;
  endpointUrl: string;
  signer: AeatVerifactuSignerPort;
  transport: AeatVerifactuTransportPort;
}


export interface VerifactuResponseRedacted {
  schemaVersion: 'anclora-verifactu-response-redacted-v1';
  environment: VerifactuSubmissionEnvironment;
  status: 'ACCEPTED' | 'REJECTED' | 'TECHNICAL_ERROR';
  reference: string | null;
  message: string;
  submittedAt: string;
}

export interface VerifactuSubmissionAttemptOutcome {
  status: Extract<VerifactuSubmissionStatus, 'ACCEPTED' | 'REJECTED' | 'TECHNICAL_ERROR'>;
  responseRedacted: VerifactuResponseRedacted;
  attemptCountIncrement: 1;
}

function safeTechnicalErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return 'VERIFACTU_TECHNICAL_ERROR';
}

export async function createVerifactuSubmissionAttempt(
  adapter: VerifactuPort,
  record: IntegrityRecord,
  draft: VerifactuSubmissionDraft,
  submittedAt: string,
  context?: VerifactuSubmissionExecutionContext | undefined,
): Promise<VerifactuSubmissionAttemptOutcome> {
  if (draft.status !== 'PENDING') {
    throw new Error('VERIFACTU_SUBMISSION_NOT_PENDING');
  }

  if (!draft.canSubmit) {
    throw new Error('VERIFACTU_SUBMISSION_NOT_SUBMITTABLE');
  }

  try {
    const result = context
      ? await adapter.submit(record, context)
      : await adapter.submit(record);

    return {
      status: result.status,
      responseRedacted: {
        schemaVersion: 'anclora-verifactu-response-redacted-v1',
        environment: draft.environment,
        status: result.status,
        reference: result.reference,
        message: result.message,
        submittedAt,
      },
      attemptCountIncrement: 1,
    };
  } catch (error) {
    return {
      status: 'TECHNICAL_ERROR',
      responseRedacted: {
        schemaVersion: 'anclora-verifactu-response-redacted-v1',
        environment: draft.environment,
        status: 'TECHNICAL_ERROR',
        reference: null,
        message: safeTechnicalErrorMessage(error),
        submittedAt,
      },
      attemptCountIncrement: 1,
    };
  }
}


/**
 * Minimum time that must elapse between AEAT submission attempts for the
 * same record after a technical error (FASE 5: ordered retries + minimum
 * cadence). Callers may override this via `resolveVerifactuPersistedOutcome`'s
 * `minRetryIntervalMs` parameter for tests; production code always uses the
 * default.
 */
export const VERIFACTU_MIN_RETRY_INTERVAL_MS = 60 * 60 * 1000;

/**
 * A minimal view of one record in an AEAT chaining scope (tenant + legal
 * entity + software installation), used only to decide retry/ordering
 * eligibility for another record in the same scope -- not the full
 * submission.
 */
export interface VerifactuChainMember {
  id: string;
  /** ISO 8601 issuance timestamp -- the real AEAT chain order (see
   * verifactu-chain-resolution-service.ts), not row insertion order. */
  issuedAt: string;
  status: VerifactuSubmissionStatus;
}

const CHAIN_RESOLVED_STATUSES: ReadonlySet<VerifactuSubmissionStatus> = new Set([
  'ACCEPTED',
  'ACCEPTED_WITH_ERRORS',
]);

export type VerifactuRetryBlockReason =
  | 'EARLIER_CHAIN_RECORD_PENDING'
  | 'RETRY_NOT_DUE';

export type VerifactuRetryEligibility =
  | { canSubmit: true }
  | { canSubmit: false; reason: VerifactuRetryBlockReason };

export interface VerifactuRetryEligibilityInput {
  target: VerifactuChainMember & { nextAttemptAt: string | null };
  /** Every other member of the same AEAT chain scope. The caller (repository
   * query) is responsible for excluding `target.id`. */
  chain: VerifactuChainMember[];
  now: string;
}

/**
 * Decides whether a PENDING or RETRY_SCHEDULED submission may be attempted
 * right now, enforcing both FASE 5 rules:
 *
 *  1. Temporal order -- a later record in the same AEAT chain scope cannot
 *     be sent while an earlier record is still unresolved. A record counts
 *     as resolved only once it is ACCEPTED or ACCEPTED_WITH_ERRORS; a
 *     REJECTED earlier record still blocks later records because it stays
 *     final until a human/process intervenes (it never unblocks the chain
 *     on its own).
 *  2. Minimum cadence -- a RETRY_SCHEDULED record cannot be reattempted
 *     before its `nextAttemptAt`.
 */
export function decideVerifactuRetryEligibility(
  input: VerifactuRetryEligibilityInput,
): VerifactuRetryEligibility {
  const { target, chain, now } = input;

  const nowMs = new Date(now).getTime();
  const targetIssuedAtMs = new Date(target.issuedAt).getTime();

  const earlierUnresolvedExists = chain.some((member) => {
    if (member.id === target.id) return false;
    if (new Date(member.issuedAt).getTime() >= targetIssuedAtMs) return false;
    return !CHAIN_RESOLVED_STATUSES.has(member.status);
  });

  if (earlierUnresolvedExists) {
    return { canSubmit: false, reason: 'EARLIER_CHAIN_RECORD_PENDING' };
  }

  if (target.status === 'RETRY_SCHEDULED') {
    if (!target.nextAttemptAt || new Date(target.nextAttemptAt).getTime() > nowMs) {
      return { canSubmit: false, reason: 'RETRY_NOT_DUE' };
    }
  }

  return { canSubmit: true };
}

export interface VerifactuPersistedSubmissionOutcome {
  status: VerifactuSubmissionStatus;
  responseRedacted: VerifactuResponseRedacted;
  attemptCountIncrement: 1;
  nextAttemptAt: string | null;
  lastError: string | null;
}

/**
 * Turns a raw attempt outcome into the status/scheduling fields the
 * repository should persist on the submission row.
 *
 * A TECHNICAL_ERROR result is never persisted as-is: it becomes
 * RETRY_SCHEDULED with `nextAttemptAt` set at least `minRetryIntervalMs` in
 * the future (default: one hour, see VERIFACTU_MIN_RETRY_INTERVAL_MS) and
 * `lastError` recorded from the technical-error message.
 *
 * ACCEPTED, ACCEPTED_WITH_ERRORS and REJECTED are terminal outcomes and are
 * persisted unchanged. REJECTED intentionally does NOT auto-retry: it stays
 * final until a human/process intervenes.
 */
export function resolveVerifactuPersistedOutcome(
  outcome: VerifactuSubmissionAttemptOutcome,
  now: string,
  minRetryIntervalMs: number = VERIFACTU_MIN_RETRY_INTERVAL_MS,
): VerifactuPersistedSubmissionOutcome {
  if (outcome.status === 'TECHNICAL_ERROR') {
    return {
      status: 'RETRY_SCHEDULED',
      responseRedacted: outcome.responseRedacted,
      attemptCountIncrement: outcome.attemptCountIncrement,
      nextAttemptAt: new Date(new Date(now).getTime() + minRetryIntervalMs).toISOString(),
      lastError: outcome.responseRedacted.message,
    };
  }

  return {
    status: outcome.status,
    responseRedacted: outcome.responseRedacted,
    attemptCountIncrement: outcome.attemptCountIncrement,
    nextAttemptAt: null,
    lastError: outcome.status === 'REJECTED' ? outcome.responseRedacted.message : null,
  };
}

export interface VerifactuSubmissionExecutable {
  id: string;
  tenantId: string;
  fiscalDocumentId: string;
  environment: VerifactuSubmissionEnvironment;
  status: 'PENDING' | 'RETRY_SCHEDULED';
  payloadRedacted: VerifactuPayloadRedacted;
  attemptCount: string;
  nextAttemptAt: string | null;
  lastError: string | null;
}

export interface VerifactuSubmissionExecutionRepositoryPort {
  findPendingById(input: {
    tenantId: string;
    submissionId: string;
  }): Promise<VerifactuSubmissionExecutable | null>;

  /**
   * Returns every other record in the same AEAT chain scope (tenant + legal
   * entity + software installation), for ordering enforcement. Optional so
   * that mock repositories used in unit tests that don't exercise chain
   * ordering don't need to implement it -- the real
   * DrizzleVerifactuSubmissionsRepository always provides it, and
   * VerifactuSubmissionExecutionService skips the ordering guard when it is
   * absent.
   */
  findChainMembers?(input: {
    tenantId: string;
    legalEntityId: string;
    softwareInstallationNumber: string;
    excludeSubmissionId: string;
  }): Promise<VerifactuChainMember[]>;

  applyAttemptOutcome(input: {
    tenantId: string;
    submissionId: string;
    outcome: VerifactuPersistedSubmissionOutcome;
  }): Promise<unknown | null>;
}

export type VerifactuSubmissionExecutionResult =
  | {
      ok: true;
      outcome: VerifactuPersistedSubmissionOutcome;
    }
  | {
      ok: false;
      reason:
        | 'SUBMISSION_NOT_FOUND_OR_NOT_PENDING'
        | 'VERIFACTU_RUNTIME_NOT_SUBMITTABLE'
        | 'VERIFACTU_SUBMISSION_ENVIRONMENT_MISMATCH'
        | 'VERIFACTU_OFFICIAL_AEAT_METADATA_MISSING'
        | 'VERIFACTU_PAYLOAD_INTEGRITY_MISMATCH'
        | 'VERIFACTU_EARLIER_CHAIN_RECORD_PENDING'
        | 'VERIFACTU_RETRY_NOT_DUE';
    };

function expectedRuntimeEnvironment(config: VerifactuRuntimeConfig): VerifactuSubmissionEnvironment {
  if (config.mode === 'production') return 'production';
  if (config.mode === 'test') return 'test';
  return 'mock';
}

function requiresOfficialAeatMetadata(config: VerifactuRuntimeConfig): boolean {
  return config.mode === 'test' || config.mode === 'production';
}

function hasOfficialAeatMetadata(payload: VerifactuPayloadRedacted): boolean {
  const official = payload.officialAeat;

  return Boolean(
    official
      && official.schemaVersion === 'anclora-aeat-official-billing-record-redacted-v1'
      && official.legalEntityId.trim()
      && official.softwareInstallationNumber.trim()
      && official.idEmisorFactura.trim()
      && official.numSerieFactura.trim()
      && official.fechaExpedicionFactura.trim()
      && official.tipoFactura.trim()
      && /^[A-F0-9]{64}$/.test(official.huella.trim().toUpperCase())
      && official.huellaGeneratedAt.trim()
      && (
        !official.previousHuella
        || (
          official.previousIdEmisorFactura?.trim()
          && official.previousNumSerieFactura?.trim()
          && official.previousFechaExpedicionFactura?.trim()
        )
      ),
  );
}

function recordFromExecutableSubmission(submission: VerifactuSubmissionExecutable): IntegrityRecord {
  const payload = submission.payloadRedacted;

  const rebuilt = createIntegrityRecord(
    {
      documentId: submission.fiscalDocumentId,
      documentNumber: payload.documentNumber,
      recordType: payload.recordType,
      issuedAt: payload.issuedAt,
      totalAmount: payload.totalAmount,
      taxAmount: payload.taxAmount,
      ...(payload.previousHash ? { previousHash: payload.previousHash } : {}),
    },
    payload.issuedAt,
  );

  if (
    rebuilt.hash !== payload.chainHash ||
    rebuilt.hash !== payload.documentHash ||
    rebuilt.algorithm !== payload.algorithm
  ) {
    throw new Error('VERIFACTU_PAYLOAD_INTEGRITY_MISMATCH');
  }

  return rebuilt;
}

export class VerifactuSubmissionExecutionService {
  constructor(
    private readonly dependencies: {
      repository: VerifactuSubmissionExecutionRepositoryPort;
      adapter: VerifactuPort;
      runtimeConfig: VerifactuRuntimeConfig;
      now?: () => string;
    },
  ) {}

  async submitPending(input: {
    tenantId: string;
    submissionId: string;
  }): Promise<VerifactuSubmissionExecutionResult> {
    if (!this.dependencies.runtimeConfig.enabled || !this.dependencies.runtimeConfig.canSubmit) {
      return { ok: false, reason: 'VERIFACTU_RUNTIME_NOT_SUBMITTABLE' };
    }

    const submission = await this.dependencies.repository.findPendingById(input);

    if (!submission) {
      return { ok: false, reason: 'SUBMISSION_NOT_FOUND_OR_NOT_PENDING' };
    }

    const expectedEnvironment = expectedRuntimeEnvironment(this.dependencies.runtimeConfig);

    if (submission.payloadRedacted.environment !== expectedEnvironment) {
      return { ok: false, reason: 'VERIFACTU_SUBMISSION_ENVIRONMENT_MISMATCH' };
    }

    if (
      requiresOfficialAeatMetadata(this.dependencies.runtimeConfig)
      && !hasOfficialAeatMetadata(submission.payloadRedacted)
    ) {
      return { ok: false, reason: 'VERIFACTU_OFFICIAL_AEAT_METADATA_MISSING' };
    }

    let record: IntegrityRecord;
    try {
      record = recordFromExecutableSubmission(submission);
    } catch {
      return { ok: false, reason: 'VERIFACTU_PAYLOAD_INTEGRITY_MISMATCH' };
    }

    const now = this.dependencies.now?.() ?? new Date().toISOString();

    if (this.dependencies.repository.findChainMembers && submission.payloadRedacted.officialAeat) {
      const { legalEntityId, softwareInstallationNumber } = submission.payloadRedacted.officialAeat;

      const chain = await this.dependencies.repository.findChainMembers({
        tenantId: input.tenantId,
        legalEntityId,
        softwareInstallationNumber,
        excludeSubmissionId: submission.id,
      });

      const eligibility = decideVerifactuRetryEligibility({
        target: {
          id: submission.id,
          issuedAt: submission.payloadRedacted.issuedAt,
          status: submission.status,
          nextAttemptAt: submission.nextAttemptAt,
        },
        chain,
        now,
      });

      if (!eligibility.canSubmit) {
        return {
          ok: false,
          reason: eligibility.reason === 'EARLIER_CHAIN_RECORD_PENDING'
            ? 'VERIFACTU_EARLIER_CHAIN_RECORD_PENDING'
            : 'VERIFACTU_RETRY_NOT_DUE',
        };
      }
    }

    const draft: VerifactuSubmissionDraft = {
      environment: submission.payloadRedacted.environment,
      status: 'PENDING',
      payloadRedacted: submission.payloadRedacted,
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: true,
    };

    const executionContext = submission.payloadRedacted.officialAeat
      ? { officialAeat: submission.payloadRedacted.officialAeat }
      : undefined;

    const outcome = await createVerifactuSubmissionAttempt(
      this.dependencies.adapter,
      record,
      draft,
      now,
      executionContext,
    );

    const persistedOutcome = resolveVerifactuPersistedOutcome(outcome, now);

    const persisted = await this.dependencies.repository.applyAttemptOutcome({
      tenantId: input.tenantId,
      submissionId: input.submissionId,
      outcome: persistedOutcome,
    });

    if (!persisted) {
      return { ok: false, reason: 'SUBMISSION_NOT_FOUND_OR_NOT_PENDING' };
    }

    return { ok: true, outcome: persistedOutcome };
  }
}

export class AeatVerifactuAdapter implements VerifactuPort {
  constructor(
    private readonly config: VerifactuRuntimeConfig,
    private readonly options: AeatVerifactuAdapterOptions,
  ) {}

  async submit(record: IntegrityRecord): Promise<VerifactuSubmissionResult> {
    if (!this.config.enabled || !this.config.canSubmit) {
      throw new Error('VERIFACTU_NOT_ENABLED');
    }

    if (this.config.mode === 'disabled' || this.config.mode === 'mock') {
      throw new Error('VERIFACTU_AEAT_ADAPTER_REQUIRES_AEAT_MODE');
    }

    if (this.config.mode !== this.options.environment) {
      throw new Error('VERIFACTU_AEAT_ENVIRONMENT_MISMATCH');
    }

    if (this.config.mode === 'production' && !this.config.productionSafe) {
      throw new Error('VERIFACTU_PRODUCTION_NOT_SAFE');
    }

    if (!this.options.endpointUrl.trim()) {
      throw new Error('VERIFACTU_AEAT_ENDPOINT_NOT_CONFIGURED');
    }

    const signedPayload = await this.options.signer.sign(record);

    if (!signedPayload.signedXml.trim()) {
      throw new Error('VERIFACTU_AEAT_SIGNED_PAYLOAD_EMPTY');
    }

    const response = await this.options.transport.submit({
      environment: this.options.environment,
      endpointUrl: this.options.endpointUrl,
      record,
      signedPayload,
    });

    return {
      status: response.status,
      reference: response.reference,
      message: response.message,
    };
  }
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
