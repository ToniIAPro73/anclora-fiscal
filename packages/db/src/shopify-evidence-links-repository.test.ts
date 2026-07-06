import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleShopifyEvidenceLinksRepository } from './shopify-evidence-links-repository';
import { auditEvents, commercialOrders, importFiles, importJobs, shopifyOrderPaymentEvents, shopifyPaymentsLedgerEntries, tenants, users } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seed(db: ReturnType<typeof createOfflineDatabase>['db'], slug = 'tenant-a') {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant missing');
  const [actor] = await db.insert(users).values({ tenantId: tenant.id, emailEncrypted: 'actor@test', displayName: 'Actor', passwordHash: 'hash' }).returning({ id: users.id });
  const [job] = await db.insert(importJobs).values({ tenantId: tenant.id, status: 'IMPORTED', connectorId: 'shopify' }).returning({ id: importJobs.id });
  if (!actor || !job) throw new Error('seed missing');
  const [file] = await db.insert(importFiles).values({ tenantId: tenant.id, importJobId: job.id, storageKey: `${slug}/file`, originalNameEncrypted: 'cipher', mimeType: 'text/csv', byteSize: '1', sha256: slug.padEnd(64, '0').slice(0, 64), importerVersion: 'test' }).returning({ id: importFiles.id });
  const [order] = await db.insert(commercialOrders).values({ tenantId: tenant.id, sourceChannel: 'SHOPIFY', externalOrderId: 'AI-1001', totalAmount: '6.99' }).returning({ id: commercialOrders.id });
  if (!file || !order) throw new Error('evidence seed missing');
  return { tenantId: tenant.id, actorId: actor.id, importFileId: file.id, orderId: order.id };
}

async function addTransaction(db: ReturnType<typeof createOfflineDatabase>['db'], seedData: Awaited<ReturnType<typeof seed>>, input: { key: string; kind: string; amount: string; at: string }) {
  const [row] = await db.insert(shopifyOrderPaymentEvents).values({ tenantId: seedData.tenantId, importFileId: seedData.importFileId, externalEventKey: input.key, commercialOrderId: seedData.orderId, shopifyOrderId: '9001', shopifyOrderName: 'AI-1001', kind: input.kind, gateway: 'shopify_payments', status: 'success', amount: input.amount, currency: 'EUR', occurredAt: new Date(input.at) }).returning({ id: shopifyOrderPaymentEvents.id });
  if (!row) throw new Error('transaction missing');
  return row.id;
}

async function addLedger(db: ReturnType<typeof createOfflineDatabase>['db'], seedData: Awaited<ReturnType<typeof seed>>, input: { key: string; type: string; amount: string; fee?: string; at: string; payoutId?: string }) {
  const fee = input.fee ?? '0.00';
  const [row] = await db.insert(shopifyPaymentsLedgerEntries).values({ tenantId: seedData.tenantId, importFileId: seedData.importFileId, externalEntryKey: input.key, commercialOrderId: seedData.orderId, shopifyOrderName: 'AI-1001', entryType: input.type, transactionAt: new Date(input.at), amount: input.amount, feeAmount: fee, netAmount: String(Number(input.amount) - Number(fee)), currency: 'EUR', payoutStatus: input.payoutId ? 'paid' : 'pending', externalPayoutId: input.payoutId }).returning({ id: shopifyPaymentsLedgerEntries.id });
  if (!row) throw new Error('ledger missing');
  return row.id;
}

describe('DrizzleShopifyEvidenceLinksRepository', () => {
  it('resuelve por nombre exacto aunque la evidencia se importara antes que el pedido', async () => {
    const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const data = await seed(db);
    const transactionId = await addTransaction(db, data, { key: 'sale-before-order', kind: 'sale', amount: '6.99', at: '2026-07-01T10:00:00Z' });
    const ledgerId = await addLedger(db, data, { key: 'charge-before-order', type: 'charge', amount: '6.99', at: '2026-07-01T11:00:00Z' });
    await db.update(shopifyOrderPaymentEvents).set({ commercialOrderId: null }).where(eq(shopifyOrderPaymentEvents.id, transactionId));
    await db.update(shopifyPaymentsLedgerEntries).set({ commercialOrderId: null }).where(eq(shopifyPaymentsLedgerEntries.id, ledgerId));
    const repository = new DrizzleShopifyEvidenceLinksRepository(db);

    await repository.linkTenantEvidence(data.tenantId, { windowDays: 3 });
    const links = await repository.list({ tenantId: data.tenantId });
    expect(links.filter((link) => link.state === 'AUTO_LINKED')).toHaveLength(2);
  });

  it('crea enlaces exactos al pedido y una propuesta transaction-ledger idempotente', async () => {
    const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const data = await seed(db);
    await addTransaction(db, data, { key: 'sale-1', kind: 'sale', amount: '6.99', at: '2026-07-01T10:00:00Z' });
    await addLedger(db, data, { key: 'charge-1', type: 'charge', amount: '6.99', fee: '0.45', at: '2026-07-02T10:00:00Z' });
    const repository = new DrizzleShopifyEvidenceLinksRepository(db);

    await repository.linkTenantEvidence(data.tenantId, { windowDays: 3 });
    await repository.linkTenantEvidence(data.tenantId, { windowDays: 3 });
    const links = await repository.list({ tenantId: data.tenantId });

    expect(links).toHaveLength(3);
    expect(links.filter((link) => link.state === 'AUTO_LINKED')).toHaveLength(2);
    expect(links.find((link) => link.linkType === 'TRANSACTION_TO_LEDGER')).toMatchObject({ state: 'PROPOSED', confidence: '0.9500' });
  });

  it('no propone por importe aislado si difieren pedido, moneda, tipo o ventana temporal', async () => {
    const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const data = await seed(db);
    await addTransaction(db, data, { key: 'sale-1', kind: 'sale', amount: '6.99', at: '2026-07-01T10:00:00Z' });
    await addLedger(db, data, { key: 'late-refund', type: 'refund', amount: '6.99', at: '2026-08-01T10:00:00Z' });
    const repository = new DrizzleShopifyEvidenceLinksRepository(db);

    await repository.linkTenantEvidence(data.tenantId, { windowDays: 3 });
    const links = await repository.list({ tenantId: data.tenantId, state: 'PROPOSED' });
    expect(links).toHaveLength(0);
  });

  it('mantiene como propuestas ambiguas dos transacciones similares sin auto-confirmarlas', async () => {
    const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const data = await seed(db);
    await addTransaction(db, data, { key: 'sale-a', kind: 'sale', amount: '6.99', at: '2026-07-01T10:00:00Z' });
    await addTransaction(db, data, { key: 'sale-b', kind: 'sale', amount: '6.99', at: '2026-07-01T10:05:00Z' });
    await addLedger(db, data, { key: 'charge-1', type: 'charge', amount: '6.99', at: '2026-07-01T11:00:00Z' });
    const repository = new DrizzleShopifyEvidenceLinksRepository(db);

    await repository.linkTenantEvidence(data.tenantId, { windowDays: 3 });
    const proposals = await repository.list({ tenantId: data.tenantId, state: 'PROPOSED' });
    expect(proposals).toHaveLength(2);
    expect(proposals.every((link) => link.confidence === '0.8000')).toBe(true);
    expect(proposals.every((link) => (link.explanationJson as { collisionCount: number }).collisionCount === 2)).toBe(true);
    expect(proposals.every((link) => link.state === 'PROPOSED')).toBe(true);
  });

  it('explica refund completo, fee no revertida, neto de ledger y banco no verificado', async () => {
    const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const data = await seed(db);
    await addTransaction(db, data, { key: 'refund-1', kind: 'refund', amount: '-6.99', at: '2026-07-03T10:00:00Z' });
    await addLedger(db, data, { key: 'refund-ledger', type: 'refund', amount: '-6.99', fee: '-0.45', at: '2026-07-03T11:00:00Z' });
    const repository = new DrizzleShopifyEvidenceLinksRepository(db);

    await repository.linkTenantEvidence(data.tenantId, { windowDays: 3 });
    const [proposal] = await repository.list({ tenantId: data.tenantId, state: 'PROPOSED' });
    expect(proposal?.explanationJson).toMatchObject({ kind: 'refund', commercialSaleAmount: 6.99, commercialNetAfterTransaction: 0, platformFeeAmount: -0.45, ledgerNetAmount: -6.54, payoutStatus: 'pending', bankVerified: false });
  });

  it('confirma o rechaza con actor y auditoría sin permitir acceso entre tenants', async () => {
    const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const data = await seed(db, 'tenant-a');
    await addTransaction(db, data, { key: 'sale-1', kind: 'sale', amount: '6.99', at: '2026-07-01T10:00:00Z' });
    await addLedger(db, data, { key: 'charge-1', type: 'charge', amount: '6.99', at: '2026-07-01T11:00:00Z' });
    const other = await seed(db, 'tenant-b');
    const repository = new DrizzleShopifyEvidenceLinksRepository(db);
    await repository.linkTenantEvidence(data.tenantId, { windowDays: 3 });
    const [proposal] = await repository.list({ tenantId: data.tenantId, state: 'PROPOSED' });
    if (!proposal) throw new Error('proposal missing');

    expect(await repository.decide(other.tenantId, proposal.id, other.actorId, 'REJECTED')).toBeNull();
    const decided = await repository.decide(data.tenantId, proposal.id, data.actorId, 'CONFIRMED');
    expect(decided).toMatchObject({ state: 'CONFIRMED', decidedBy: data.actorId });
    const events = await db.select().from(auditEvents).where(eq(auditEvents.entityId, proposal.id));
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('SHOPIFY_EVIDENCE_LINK_CONFIRMED');
  });
});
