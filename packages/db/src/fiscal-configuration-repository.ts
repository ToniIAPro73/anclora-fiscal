import { and, asc, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';
import { auditEvents, channelFiscalPolicies, invoiceSeries, legalEntities, productTaxProfiles } from './schema.js';

export interface FiscalConfigurationSnapshot {
  legalEntity: typeof legalEntities.$inferSelect | null;
  series: Array<typeof invoiceSeries.$inferSelect>;
  productTaxProfiles: Array<typeof productTaxProfiles.$inferSelect>;
  channelPolicies: Array<typeof channelFiscalPolicies.$inferSelect>;
  readiness: { ready: boolean; missing: string[] };
}

export interface SaveMinimumFiscalConfigurationInput {
  tenantId: string;
  actorId: string | null;
  legalEntity: {
    legalName: string;
    tradeName?: string | null;
    countryCode: string;
    currencyCode: string;
    address: string;
    contactEmail?: string | null;
    taxIdentityEncrypted?: string | null;
  };
  series: { code: string; fiscalYear: number; documentType: string };
  productProfile: {
    selector: string;
    productNature: string;
    invoiceDescription: string;
    domesticTaxCode: string;
    domesticTaxRate: string;
    ossEligible: boolean;
    shippingRequired: boolean;
    effectiveFrom: string;
  };
  kdpPolicy: {
    version: string;
    effectiveFrom: string;
    accountingPolicy: 'NET_ROYALTY_ONLY' | 'GROSS_AND_COST_REVIEW_REQUIRED';
    embeddedCostTreatment: string;
    reviewLevel: string;
  };
}

export class DrizzleFiscalConfigurationRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<TQueryResult, typeof schema>) {}

  async get(tenantId: string): Promise<FiscalConfigurationSnapshot> {
    const [legalEntity] = await this.db.select().from(legalEntities)
      .where(eq(legalEntities.tenantId, tenantId)).orderBy(asc(legalEntities.createdAt)).limit(1);
    const [series, profiles, policies] = await Promise.all([
      this.db.select().from(invoiceSeries).where(and(eq(invoiceSeries.tenantId, tenantId), eq(invoiceSeries.active, true))),
      this.db.select().from(productTaxProfiles).where(and(eq(productTaxProfiles.tenantId, tenantId), eq(productTaxProfiles.active, true))),
      this.db.select().from(channelFiscalPolicies).where(and(eq(channelFiscalPolicies.tenantId, tenantId), eq(channelFiscalPolicies.active, true))),
    ]);
    const missing: string[] = [];
    if (!legalEntity || !legalEntity.address || legalEntity.configurationStatus !== 'READY') missing.push('ISSUER');
    if (series.length === 0) missing.push('INVOICE_SERIES');
    if (profiles.length === 0) missing.push('PRODUCT_TAX_PROFILE');
    if (!policies.some((policy) => policy.channel === 'AMAZON_KDP')) missing.push('KDP_POLICY');
    return { legalEntity: legalEntity ?? null, series, productTaxProfiles: profiles, channelPolicies: policies, readiness: { ready: missing.length === 0, missing } };
  }

  async getTaxEngineConfig(tenantId: string) {
    const snapshot = await this.get(tenantId);
    if (!snapshot.legalEntity || !snapshot.readiness.ready) return undefined;
    return {
      id: `TENANT_${tenantId}`,
      version: snapshot.productTaxProfiles.map((profile) => `${profile.selector}:${profile.effectiveFrom}`).join('|'),
      effectiveFrom: snapshot.productTaxProfiles.map((profile) => profile.effectiveFrom).sort()[0] ?? new Date().toISOString().slice(0, 10),
      issuerCountry: snapshot.legalEntity.countryCode,
      rates: snapshot.productTaxProfiles.map((profile) => ({ id: profile.domesticTaxCode, rate: Number(profile.domesticTaxRate), productNature: profile.productNature, customerCountry: snapshot.legalEntity?.countryCode ?? 'ES' })),
      marketplaceRoyaltyExemptRate: 0,
      sources: [],
    };
  }

  async saveMinimum(input: SaveMinimumFiscalConfigurationInput): Promise<FiscalConfigurationSnapshot> {
    await this.db.transaction(async (tx) => {
      const [existingEntity] = await tx.select().from(legalEntities).where(eq(legalEntities.tenantId, input.tenantId)).limit(1);
      const entityValues = { ...input.legalEntity, tenantId: input.tenantId, configurationStatus: 'READY', updatedAt: new Date() };
      const [entity] = existingEntity
        ? await tx.update(legalEntities).set(entityValues).where(and(eq(legalEntities.id, existingEntity.id), eq(legalEntities.tenantId, input.tenantId))).returning()
        : await tx.insert(legalEntities).values(entityValues).returning();
      if (!entity) throw new Error('No se pudo persistir la entidad emisora');

      await tx.insert(invoiceSeries).values({ tenantId: input.tenantId, legalEntityId: entity.id, ...input.series })
        .onConflictDoUpdate({ target: [invoiceSeries.legalEntityId, invoiceSeries.code], set: { fiscalYear: input.series.fiscalYear, documentType: input.series.documentType, active: true, updatedAt: new Date() } });
      await tx.insert(productTaxProfiles).values({ tenantId: input.tenantId, legalEntityId: entity.id, ...input.productProfile })
        .onConflictDoUpdate({ target: [productTaxProfiles.tenantId, productTaxProfiles.legalEntityId, productTaxProfiles.selector, productTaxProfiles.effectiveFrom], set: { ...input.productProfile, active: true, updatedAt: new Date() } });
      await tx.insert(channelFiscalPolicies).values({ tenantId: input.tenantId, channel: 'AMAZON_KDP', version: input.kdpPolicy.version, effectiveFrom: input.kdpPolicy.effectiveFrom, kdpAccountingPolicy: input.kdpPolicy.accountingPolicy, embeddedCostTreatment: input.kdpPolicy.embeddedCostTreatment, reviewLevel: input.kdpPolicy.reviewLevel })
        .onConflictDoUpdate({ target: [channelFiscalPolicies.tenantId, channelFiscalPolicies.channel, channelFiscalPolicies.version], set: { effectiveFrom: input.kdpPolicy.effectiveFrom, kdpAccountingPolicy: input.kdpPolicy.accountingPolicy, embeddedCostTreatment: input.kdpPolicy.embeddedCostTreatment, reviewLevel: input.kdpPolicy.reviewLevel, active: true, updatedAt: new Date() } });
      await tx.insert(auditEvents).values({ tenantId: input.tenantId, actorId: input.actorId, action: 'FISCAL_CONFIGURATION_SAVED', entityType: 'LegalEntity', entityId: entity.id, metadata: { readiness: 'READY' } });
    });
    return this.get(input.tenantId);
  }
}
