import { describe, expect, it } from 'vitest';
import { createSifEvent, verifySifEventChain, type SifEvent } from './sif-events';

describe('SIF events', () => {
  it('encadena hash/huella anterior y es verificable', () => {
    const first = createSifEvent(
      { eventType: 'STARTUP', actor: 'system', detail: { version: '1.0.0' } },
      '2026-07-03T09:00:00.000Z',
    );
    const second = createSifEvent(
      { eventType: 'INTEGRITY_ERROR', actor: 'system', detail: { documentId: 'doc-1' }, previousHash: first.hash },
      '2026-07-03T10:00:00.000Z',
    );

    expect(first.previousHash).toBeUndefined();
    expect(second.previousHash).toBe(first.hash);
    expect(verifySifEventChain([first, second])).toBe(true);
  });

  it('detecta alteraciones en la cadena', () => {
    const first = createSifEvent(
      { eventType: 'STARTUP', actor: 'system', detail: {} },
      '2026-07-03T09:00:00.000Z',
    );
    const second = createSifEvent(
      { eventType: 'SHUTDOWN', actor: 'system', detail: {}, previousHash: first.hash },
      '2026-07-03T09:05:00.000Z',
    );

    const tampered: SifEvent = { ...second, canonicalPayload: second.canonicalPayload.replace('SHUTDOWN', 'STARTUP') };

    expect(verifySifEventChain([first, tampered])).toBe(false);
  });

  it('detecta un previousHash roto (no coincide con el evento anterior real)', () => {
    const first = createSifEvent(
      { eventType: 'STARTUP', actor: 'system', detail: {} },
      '2026-07-03T09:00:00.000Z',
    );
    const orphan = createSifEvent(
      { eventType: 'ANOMALY', actor: 'system', detail: {}, previousHash: 'not-the-real-previous-hash' },
      '2026-07-03T09:10:00.000Z',
    );

    expect(verifySifEventChain([first, orphan])).toBe(false);
  });

  it('reproduce siempre el mismo hash para el mismo payload canónico', () => {
    const a = createSifEvent({ eventType: 'RESTORE_RETRY', actor: 'system', detail: { attempt: 1 } }, '2026-07-03T09:00:00.000Z');
    const b = createSifEvent({ eventType: 'RESTORE_RETRY', actor: 'system', detail: { attempt: 1 } }, '2026-07-03T09:00:00.000Z');

    expect(a.hash).toBe(b.hash);
  });
});
