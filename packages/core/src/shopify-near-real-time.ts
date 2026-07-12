import { createHash } from 'node:crypto';
export type ShopifyRealtimeEventType = 'ORDER_CREATED'|'ORDER_UPDATED'|'TRANSACTION'|'PAYMENT'|'REFUND'|'PAYOUT_LEDGER';
export interface ShopifyRealtimeEnvelope { schemaVersion: '1.0'; tenantStoreKey: string; eventType: ShopifyRealtimeEventType; eventId: string; occurredAt: string; receivedAt: string; idempotencyKey: string; hmacSignature: string; rawEvidenceHash: string; payload: Record<string, unknown> }
export interface ShopifyRealtimeSecurity { verifyHmac(rawBody: Uint8Array, signature: string, secret: string): boolean; assertFresh(receivedAt: string, now: string, toleranceSeconds: number): void }
export function normalizeShopifyRealtimeEnvelope(input: Omit<ShopifyRealtimeEnvelope,'schemaVersion'|'rawEvidenceHash'>, rawBody: Uint8Array): ShopifyRealtimeEnvelope {
  if (!input.idempotencyKey || !input.eventId || !input.tenantStoreKey) throw new Error('SHOPIFY_REALTIME_IDENTITY_REQUIRED');
  return { ...input, schemaVersion:'1.0', rawEvidenceHash:createHash('sha256').update(rawBody).digest('hex') };
}
export const SHOPIFY_REALTIME_POLICY = { primarySpeedSource:'WEBHOOK', reconciliationSource:'CSV', outOfOrder:'STORE_THEN_REPROCESS', duplicates:'IDEMPOTENCY_KEY', failures:'DEAD_LETTER_AND_ISSUE', publicEndpointImplemented:false } as const;
