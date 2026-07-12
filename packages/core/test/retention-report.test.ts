import { describe, expect, it } from 'vitest'; import { getRetentionCandidates } from '../src/retention-report';
describe('retention dry-run', () => {
  it('nunca propone borrar factura, huella o cadena', () => { const result = getRetentionCandidates([{ id:'i',kind:'INVOICE',createdAt:'2020-01-01' },{ id:'h',kind:'INTEGRITY_HASH',createdAt:'2020-01-01' },{ id:'s',kind:'SIF_EVENT',createdAt:'2020-01-01' }], '2026-01-01'); expect(result.every((item) => item.disposition === 'RETAIN')).toBe(true); });
  it('solo somete PII separable a revisión de anonimización', () => expect(getRetentionCandidates([{ id:'p',kind:'COUNTERPARTY_PII',createdAt:'2020-01-01' }], '2026-01-01')[0]?.disposition).toBe('REVIEW_ANONYMIZATION'));
});
