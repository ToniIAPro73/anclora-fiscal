import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as schema from './schema.js';
import { auditEvents, canonicalOperations, commercialOrders, fiscalDocuments, legalEntities, orderLines, productTaxProfiles, shopifyEvidenceLinks, shopifyOrderPaymentEvents, shopifyPaymentsLedgerEntries, taxDecisions } from './schema.js';

export interface ShopifySalesFilters {
  tenantId: string;
  page: number;
  pageSize: number;
  dateFrom?: Date;
  dateTo?: Date;
  paymentStatus?: string;
  refundStatus?: string;
  fiscalStatus?: string;
  settlementStatus?: 'PENDING' | 'SETTLED';
  zeroAmount?: boolean;
}

export class DrizzleShopifySalesRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<TQueryResult, typeof schema>) {}

  async list(input: ShopifySalesFilters) {
    const filters = [eq(commercialOrders.tenantId, input.tenantId), eq(commercialOrders.sourceChannel, 'SHOPIFY')];
    if (input.dateFrom) filters.push(gte(commercialOrders.commercialDate, input.dateFrom));
    if (input.dateTo) filters.push(lte(commercialOrders.commercialDate, input.dateTo));
    if (input.paymentStatus) filters.push(eq(commercialOrders.paymentStatus, input.paymentStatus));
    if (input.refundStatus) filters.push(eq(commercialOrders.refundStatus, input.refundStatus));
    if (input.fiscalStatus) filters.push(eq(commercialOrders.fiscalStatus, input.fiscalStatus));
    if (input.zeroAmount !== undefined) filters.push(input.zeroAmount ? sql`${commercialOrders.totalAmount} = 0` : sql`${commercialOrders.totalAmount} <> 0`);
    if (input.settlementStatus === 'PENDING') filters.push(sql`not exists (select 1 from ${shopifyPaymentsLedgerEntries} le where le.tenant_id = ${commercialOrders.tenantId} and le.commercial_order_id = ${commercialOrders.id} and le.external_payout_id is not null)`);
    if (input.settlementStatus === 'SETTLED') filters.push(sql`exists (select 1 from ${shopifyPaymentsLedgerEntries} le where le.tenant_id = ${commercialOrders.tenantId} and le.commercial_order_id = ${commercialOrders.id} and le.external_payout_id is not null)`);
    const where = and(...filters);
    const [items, [totalRow], [metrics]] = await Promise.all([
      this.db.select({
        id: commercialOrders.id, externalOrderId: commercialOrders.externalOrderId, commercialDate: commercialOrders.commercialDate,
        totalAmount: commercialOrders.totalAmount, taxAmount: commercialOrders.taxAmount, discountCode: commercialOrders.discountCode, discountAmount: commercialOrders.discountAmount,
        customerName: commercialOrders.customerName, customerEmail: commercialOrders.customerEmail, customerAddress: commercialOrders.customerAddress,
        paymentStatus: commercialOrders.paymentStatus, financialStatus: commercialOrders.financialStatus, refundStatus: commercialOrders.refundStatus,
        fiscalStatus: commercialOrders.fiscalStatus, customerCountry: commercialOrders.customerCountry, customerType: commercialOrders.customerType,
        transactionCount: sql<number>`(select count(*) from ${shopifyOrderPaymentEvents} pe where pe.tenant_id = ${commercialOrders.tenantId} and pe.commercial_order_id = ${commercialOrders.id})`,
        ledgerCount: sql<number>`(select count(*) from ${shopifyPaymentsLedgerEntries} le where le.tenant_id = ${commercialOrders.tenantId} and le.commercial_order_id = ${commercialOrders.id})`,
        feeAmount: sql<string>`coalesce((select sum(le.fee_amount) from ${shopifyPaymentsLedgerEntries} le where le.tenant_id = ${commercialOrders.tenantId} and le.commercial_order_id = ${commercialOrders.id}), 0)`,
        payoutStatus: sql<string | null>`(select case when max(le.external_payout_id) is not null then 'SETTLED' when count(*) > 0 then 'PENDING' else 'LEDGER_MISSING' end from ${shopifyPaymentsLedgerEntries} le where le.tenant_id = ${commercialOrders.tenantId} and le.commercial_order_id = ${commercialOrders.id})`,
      }).from(commercialOrders).where(where).orderBy(desc(commercialOrders.commercialDate)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
      this.db.select({ total: count() }).from(commercialOrders).where(where),
      this.db.select({
        salesAmount: sql<string>`coalesce(sum(case when ${commercialOrders.refundStatus} = 'NONE' then ${commercialOrders.totalAmount} else 0 end), 0)`,
        refundedAmount: sql<string>`coalesce(sum(case when ${commercialOrders.refundStatus} <> 'NONE' then ${commercialOrders.totalAmount} else 0 end), 0)`,
        feeAmount: sql<string>`coalesce((select sum(le.fee_amount) from ${shopifyPaymentsLedgerEntries} le where le.tenant_id = ${input.tenantId}), 0)`,
        pendingSettlement: sql<number>`count(*) filter (where not exists (select 1 from ${shopifyPaymentsLedgerEntries} le where le.tenant_id = ${commercialOrders.tenantId} and le.commercial_order_id = ${commercialOrders.id} and le.external_payout_id is not null))`,
      }).from(commercialOrders).where(where),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total: totalRow?.total ?? 0, metrics: metrics ?? { salesAmount: '0', refundedAmount: '0', feeAmount: '0', pendingSettlement: 0 } };
  }

  async getById(tenantId: string, orderId: string) {
    const [order] = await this.db.select().from(commercialOrders).where(and(eq(commercialOrders.tenantId, tenantId), eq(commercialOrders.id, orderId), eq(commercialOrders.sourceChannel, 'SHOPIFY'))).limit(1);
    if (!order) return null;
    const [lines, transactions, ledger, links, [operation]] = await Promise.all([
      this.db.select().from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.commercialOrderId, orderId))).orderBy(asc(orderLines.createdAt)),
      this.db.select().from(shopifyOrderPaymentEvents).where(and(eq(shopifyOrderPaymentEvents.tenantId, tenantId), eq(shopifyOrderPaymentEvents.commercialOrderId, orderId))).orderBy(asc(shopifyOrderPaymentEvents.occurredAt)),
      this.db.select().from(shopifyPaymentsLedgerEntries).where(and(eq(shopifyPaymentsLedgerEntries.tenantId, tenantId), eq(shopifyPaymentsLedgerEntries.commercialOrderId, orderId))).orderBy(asc(shopifyPaymentsLedgerEntries.transactionAt)),
      this.db.select().from(shopifyEvidenceLinks).where(and(eq(shopifyEvidenceLinks.tenantId, tenantId), eq(shopifyEvidenceLinks.leftEvidenceType, 'COMMERCIAL_ORDER'), eq(shopifyEvidenceLinks.leftEvidenceId, orderId))),
      this.db.select().from(canonicalOperations).where(and(eq(canonicalOperations.tenantId, tenantId), eq(canonicalOperations.sourceChannel, 'SHOPIFY'), eq(canonicalOperations.sourceOrderId, order.externalOrderId))).limit(1),
    ]);
    const [decision, documents, audit, [configuration], [profile]] = operation ? await Promise.all([
      this.db.select().from(taxDecisions).where(and(eq(taxDecisions.tenantId, tenantId), eq(taxDecisions.canonicalOperationId, operation.id))).orderBy(desc(taxDecisions.decidedAt)).limit(1),
      this.db.select().from(fiscalDocuments).where(and(eq(fiscalDocuments.tenantId, tenantId), eq(fiscalDocuments.canonicalOperationId, operation.id))).orderBy(desc(fiscalDocuments.issuedAt)),
      this.db.select().from(auditEvents).where(and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.entityId, operation.id))).orderBy(desc(auditEvents.occurredAt)),
      this.db.select({ id: legalEntities.id }).from(legalEntities).where(and(eq(legalEntities.tenantId, tenantId), eq(legalEntities.id, operation.legalEntityId), eq(legalEntities.configurationStatus, 'READY'))).limit(1),
      this.db.select({ id: productTaxProfiles.id }).from(productTaxProfiles).where(and(eq(productTaxProfiles.tenantId, tenantId), eq(productTaxProfiles.legalEntityId, operation.legalEntityId), eq(productTaxProfiles.active, true))).limit(1),
    ]) : [[], [], [], [], []];
    return { order, lines, transactions, ledger, links, operation: operation ?? null, taxDecision: decision[0] ?? null, documents, audit, eligibility: { hasFiscalConfiguration: Boolean(configuration), hasFiscalProfile: Boolean(profile), hasOrderEvidence: true, hasTransactionsEvidence: transactions.length > 0, hasLedgerEvidence: ledger.length > 0, hasTaxDecision: decision.length > 0 }, settlement: ledger.length === 0 ? 'LEDGER_MISSING' : ledger.some((entry) => entry.externalPayoutId) ? 'SETTLED' : 'PAYOUT_PENDING' };
  }
}
