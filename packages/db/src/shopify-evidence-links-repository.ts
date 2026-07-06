import { and, asc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditEvents, commercialOrders, shopifyEvidenceLinks, shopifyOrderPaymentEvents, shopifyPaymentsLedgerEntries, users } from './schema.js';
import * as schema from './schema.js';

export type ShopifyEvidenceLink = typeof shopifyEvidenceLinks.$inferSelect;
export type ShopifyEvidenceLinkState = 'PROPOSED' | 'AUTO_LINKED' | 'CONFIRMED' | 'REJECTED';

const compatibleTypes: Record<string, readonly string[]> = {
  sale: ['charge'],
  capture: ['charge'],
  refund: ['refund', 'partial_refund'],
};

const withinWindow = (left: Date, right: Date, windowDays: number) =>
  Math.abs(left.getTime() - right.getTime()) <= windowDays * 24 * 60 * 60 * 1000;

const compatibleAmount = (left: string, right: string) =>
  Math.abs(Math.abs(Number(left)) - Math.abs(Number(right))) <= 0.01;

/**
 * SHOPIFY-05 evidence-only linking. This repository never writes legacy
 * matching_candidates, canonical_operations, fiscal documents or bank data.
 */
export class DrizzleShopifyEvidenceLinksRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<TQueryResult, typeof schema>) {}

  async linkTenantEvidence(tenantId: string, input: { windowDays: number }): Promise<void> {
    const orders = await this.db.select({ id: commercialOrders.id, externalOrderId: commercialOrders.externalOrderId, totalAmount: commercialOrders.totalAmount })
      .from(commercialOrders).where(and(eq(commercialOrders.tenantId, tenantId), eq(commercialOrders.sourceChannel, 'SHOPIFY')));
    const ordersByName = new Map(orders.map((order) => [order.externalOrderId, order]));
    const unresolvedTransactions = await this.db.select().from(shopifyOrderPaymentEvents)
      .where(eq(shopifyOrderPaymentEvents.tenantId, tenantId));
    const unresolvedLedgerEntries = await this.db.select().from(shopifyPaymentsLedgerEntries)
      .where(eq(shopifyPaymentsLedgerEntries.tenantId, tenantId));
    for (const transaction of unresolvedTransactions) {
      const commercialOrderId = transaction.commercialOrderId ?? ordersByName.get(transaction.shopifyOrderName)?.id;
      if (commercialOrderId && !transaction.commercialOrderId) {
        await this.db.update(shopifyOrderPaymentEvents).set({ commercialOrderId })
          .where(and(eq(shopifyOrderPaymentEvents.tenantId, tenantId), eq(shopifyOrderPaymentEvents.id, transaction.id)));
      }
    }
    for (const entry of unresolvedLedgerEntries) {
      const commercialOrderId = entry.commercialOrderId ?? ordersByName.get(entry.shopifyOrderName)?.id;
      if (commercialOrderId && !entry.commercialOrderId) {
        await this.db.update(shopifyPaymentsLedgerEntries).set({ commercialOrderId })
          .where(and(eq(shopifyPaymentsLedgerEntries.tenantId, tenantId), eq(shopifyPaymentsLedgerEntries.id, entry.id)));
      }
    }
    const transactions = unresolvedTransactions.map((transaction) => ({ ...transaction, commercialOrderId: transaction.commercialOrderId ?? ordersByName.get(transaction.shopifyOrderName)?.id ?? null }));
    const ledgerEntries = unresolvedLedgerEntries.map((entry) => ({ ...entry, commercialOrderId: entry.commercialOrderId ?? ordersByName.get(entry.shopifyOrderName)?.id ?? null }));

    const exactLinks = [
      ...transactions.flatMap((transaction) => transaction.commercialOrderId ? [{
        tenantId,
        leftEvidenceType: 'COMMERCIAL_ORDER',
        leftEvidenceId: transaction.commercialOrderId,
        rightEvidenceType: 'ORDER_TRANSACTION',
        rightEvidenceId: transaction.id,
        linkType: 'ORDER_TO_TRANSACTION',
        confidence: '1.0000',
        state: 'AUTO_LINKED',
        explanationJson: { signals: ['same_tenant', 'exact_shopify_order_name'], shopifyOrderName: transaction.shopifyOrderName },
      }] : []),
      ...ledgerEntries.flatMap((entry) => entry.commercialOrderId ? [{
        tenantId,
        leftEvidenceType: 'COMMERCIAL_ORDER',
        leftEvidenceId: entry.commercialOrderId,
        rightEvidenceType: 'LEDGER_ENTRY',
        rightEvidenceId: entry.id,
        linkType: 'ORDER_TO_LEDGER',
        confidence: '1.0000',
        state: 'AUTO_LINKED',
        explanationJson: { signals: ['same_tenant', 'exact_shopify_order_name'], shopifyOrderName: entry.shopifyOrderName, bankVerified: false },
      }] : []),
    ];
    if (exactLinks.length > 0) {
      await this.db.insert(shopifyEvidenceLinks).values(exactLinks)
        .onConflictDoNothing({ target: [shopifyEvidenceLinks.tenantId, shopifyEvidenceLinks.linkType, shopifyEvidenceLinks.leftEvidenceType, shopifyEvidenceLinks.leftEvidenceId, shopifyEvidenceLinks.rightEvidenceType, shopifyEvidenceLinks.rightEvidenceId] });
    }

    const ledgerByOrder = new Map<string, typeof ledgerEntries>();
    for (const entry of ledgerEntries) {
      ledgerByOrder.set(entry.shopifyOrderName, [...(ledgerByOrder.get(entry.shopifyOrderName) ?? []), entry]);
    }
    const candidatePairs = transactions.flatMap((transaction) => {
      const candidates = (ledgerByOrder.get(transaction.shopifyOrderName) ?? []).filter((entry) =>
        entry.transactionAt
        && transaction.currency === entry.currency
        && (compatibleTypes[transaction.kind] ?? []).includes(entry.entryType)
        && compatibleAmount(transaction.amount, entry.amount)
        && withinWindow(transaction.occurredAt, entry.transactionAt, input.windowDays));
      return candidates.map((entry) => ({ transaction, entry }));
    });
    const transactionCollisions = new Map<string, number>();
    const ledgerCollisions = new Map<string, number>();
    for (const pair of candidatePairs) {
      transactionCollisions.set(pair.transaction.id, (transactionCollisions.get(pair.transaction.id) ?? 0) + 1);
      ledgerCollisions.set(pair.entry.id, (ledgerCollisions.get(pair.entry.id) ?? 0) + 1);
    }
    const proposals = candidatePairs.map(({ transaction, entry }) => {
      const collisionCount = Math.max(transactionCollisions.get(transaction.id) ?? 1, ledgerCollisions.get(entry.id) ?? 1);
      const commercialSaleAmount = Number(ordersByName.get(transaction.shopifyOrderName)?.totalAmount ?? 0);
      return {
        tenantId,
        leftEvidenceType: 'ORDER_TRANSACTION',
        leftEvidenceId: transaction.id,
        rightEvidenceType: 'LEDGER_ENTRY',
        rightEvidenceId: entry.id,
        linkType: 'TRANSACTION_TO_LEDGER',
        confidence: collisionCount === 1 ? '0.9500' : '0.8000',
        state: 'PROPOSED',
        explanationJson: {
          signals: ['same_tenant', 'same_order', 'compatible_type', 'same_currency', 'compatible_amount', 'within_time_window'],
          collisionCount,
          shopifyOrderName: transaction.shopifyOrderName,
          kind: transaction.kind,
          commercialSaleAmount,
          commercialNetAfterTransaction: transaction.kind === 'refund'
            ? Number((commercialSaleAmount + Number(transaction.amount)).toFixed(2))
            : commercialSaleAmount,
          transactionAmount: Number(transaction.amount),
          ledgerAmount: Number(entry.amount),
          platformFeeAmount: Number(entry.feeAmount),
          ledgerNetAmount: Number(entry.netAmount),
          payoutStatus: entry.payoutStatus,
          externalPayoutId: entry.externalPayoutId,
          bankVerified: false,
        },
      };
    });
    if (proposals.length > 0) {
      await this.db.insert(shopifyEvidenceLinks).values(proposals)
        .onConflictDoNothing({ target: [shopifyEvidenceLinks.tenantId, shopifyEvidenceLinks.linkType, shopifyEvidenceLinks.leftEvidenceType, shopifyEvidenceLinks.leftEvidenceId, shopifyEvidenceLinks.rightEvidenceType, shopifyEvidenceLinks.rightEvidenceId] });
    }
  }

  async list(input: { tenantId: string; state?: ShopifyEvidenceLinkState }): Promise<ShopifyEvidenceLink[]> {
    const conditions = input.state
      ? and(eq(shopifyEvidenceLinks.tenantId, input.tenantId), eq(shopifyEvidenceLinks.state, input.state))
      : eq(shopifyEvidenceLinks.tenantId, input.tenantId);
    return this.db.select().from(shopifyEvidenceLinks).where(conditions).orderBy(asc(shopifyEvidenceLinks.createdAt));
  }

  async decide(tenantId: string, linkId: string, actorId: string, state: 'CONFIRMED' | 'REJECTED'): Promise<ShopifyEvidenceLink | null> {
    return this.db.transaction(async (transaction) => {
      const [actor] = await transaction.select({ id: users.id }).from(users)
        .where(and(eq(users.id, actorId), eq(users.tenantId, tenantId))).limit(1);
      if (!actor) return null;
      const [existing] = await transaction.select().from(shopifyEvidenceLinks)
        .where(and(eq(shopifyEvidenceLinks.id, linkId), eq(shopifyEvidenceLinks.tenantId, tenantId))).limit(1);
      if (!existing) return null;
      if (existing.state === state) return existing;
      if (existing.state !== 'PROPOSED') return null;
      const decidedAt = new Date();
      const [updated] = await transaction.update(shopifyEvidenceLinks)
        .set({ state, decidedBy: actorId, decidedAt, updatedAt: decidedAt })
        .where(and(eq(shopifyEvidenceLinks.id, linkId), eq(shopifyEvidenceLinks.tenantId, tenantId)))
        .returning();
      if (!updated) return null;
      await transaction.insert(auditEvents).values({
        tenantId,
        actorId,
        action: `SHOPIFY_EVIDENCE_LINK_${state}`,
        entityType: 'ShopifyEvidenceLink',
        entityId: linkId,
        metadata: { previousState: existing.state, state },
      });
      return updated;
    });
  }
}
