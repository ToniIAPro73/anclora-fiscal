import { describe, expect, it } from 'vitest'; import { normalizeShopifyRealtimeEnvelope, SHOPIFY_REALTIME_POLICY } from '../src/shopify-near-real-time';
describe('Shopify near-real-time contract', () => {
  it('normaliza evidencia con versión, idempotencia y hash reproducible', () => { const raw = new TextEncoder().encode('{"id":1}'); const value = normalizeShopifyRealtimeEnvelope({ tenantStoreKey:'tenant:store', eventType:'ORDER_CREATED', eventId:'1', occurredAt:'2026-01-01T00:00:00Z', receivedAt:'2026-01-01T00:00:01Z', idempotencyKey:'orders/create:1', hmacSignature:'redacted', payload:{ id:1 } },raw); expect(value.schemaVersion).toBe('1.0'); expect(value.rawEvidenceHash).toMatch(/^[a-f0-9]{64}$/); });
  it('mantiene CSV como reconciliación y no crea endpoint', () => expect(SHOPIFY_REALTIME_POLICY).toMatchObject({ reconciliationSource:'CSV', publicEndpointImplemented:false }));
});
