import { createHash } from 'node:crypto';

export type SifEventType =
  | 'STARTUP'
  | 'SHUTDOWN'
  | 'INTEGRITY_ERROR'
  | 'SUBMISSION_ERROR'
  | 'RESTORE_RETRY'
  | 'ANOMALY'
  | 'ACCEPTED_WITH_ERRORS'
  | 'REJECTED'
  | 'ALERT_RESOLVED';

export interface SifEventInput {
  eventType: SifEventType;
  actor: string;
  detail: Record<string, unknown>;
  previousHash?: string | undefined;
}

export interface SifEvent extends SifEventInput {
  canonicalPayload: string;
  hash: string;
  algorithm: 'SHA-256';
  occurredAt: string;
}

function canonicalize(input: SifEventInput, occurredAt: string): string {
  return JSON.stringify({
    eventType: input.eventType,
    actor: input.actor,
    detail: input.detail,
    previousHash: input.previousHash ?? null,
    occurredAt,
  });
}

/** Hash-chained SIF event, following the same SHA-256(previousHash + canonicalPayload) pattern as `createIntegrityRecord`. */
export function createSifEvent(input: SifEventInput, occurredAt: string): SifEvent {
  const canonicalPayload = canonicalize(input, occurredAt);
  const hash = createHash('sha256')
    .update((input.previousHash ?? '') + canonicalPayload)
    .digest('hex');

  return {
    ...input,
    canonicalPayload,
    hash,
    algorithm: 'SHA-256',
    occurredAt,
  };
}

/** Verifies chain-of-custody: each event's previousHash must match the prior event's hash, and its own hash must be reproducible from its payload. */
export function verifySifEventChain(events: SifEvent[]): boolean {
  let expectedPrevious: string | undefined;

  for (const event of events) {
    if ((event.previousHash ?? undefined) !== expectedPrevious) return false;

    const recomputedHash = createHash('sha256')
      .update((event.previousHash ?? '') + event.canonicalPayload)
      .digest('hex');
    if (recomputedHash !== event.hash) return false;

    expectedPrevious = event.hash;
  }

  return true;
}
