import { and, asc, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';
import { auditEvents, channelFiscalPolicies, invoiceSeries, legalEntities, productTaxProfiles } from './schema.js';

type LegalEntitySelect = typeof legalEntities.$inferSelect;
type InvoiceSeriesSelect = typeof invoiceSeries.$inferSelect;

export interface FiscalIssuerConfiguration {
  tipoEmisor: 'PERSONA_FISICA';
  nombreLegal: string;
  nombreComercial: string | null;
  nifConfigurado: boolean;
  direccionFiscal: string | null;
  emailContacto: string | null;
  pais: string;
  moneda: string;
  epigrafeIAE: string | null;
  regimenIVA: 'REGIMEN_REDUCIDO_LIBROS_ES';
  oss: { activo: boolean; vigenteDesde: string | null };
  estadoConfiguracion: 'COMPLETA' | 'INCOMPLETA';
}

export interface FiscalConfigurationSnapshot {
  legalEntity: LegalEntitySelect | null;
  emisorFiscal: FiscalIssuerConfiguration | null;
  series: InvoiceSeriesSelect[];
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

export interface SaveFiscalIssuerConfigurationInput {
  tenantId: string;
  actorId: string | null;
  datosEmisor: {
    tipoEmisor: 'PERSONA_FISICA';
    nombreLegal: string;
    nombreComercial?: string | null;
    pais: string;
    moneda: string;
    direccionFiscal: string;
    emailContacto?: string | null;
    nifCifrado?: string | null;
    epigrafeIAE: string;
    regimenIVA: 'REGIMEN_REDUCIDO_LIBROS_ES';
  };
  oss: { activo: boolean; vigenteDesde?: string | null };
  perfilProducto: {
    selector: string;
    naturalezaProducto: string;
    descripcionFactura: string;
    codigoIVA: string;
    tipoIVA: string;
    elegibleOSS: boolean;
    requiereEnvio: boolean;
    vigenteDesde: string;
  };
  ejercicio: number;
}

const FISCAL_SERIES = [
  { code: 'FS', documentType: 'SIMPLIFICADA' },
  { code: 'F', documentType: 'COMPLETA' },
  { code: 'FR', documentType: 'RECTIFICATIVA' },
] as const;

function buildEmisorFiscal(legalEntity: LegalEntitySelect | null): FiscalIssuerConfiguration | null {
  if (!legalEntity) return null;
  return {
    tipoEmisor: 'PERSONA_FISICA',
    nombreLegal: legalEntity.legalName,
    nombreComercial: legalEntity.tradeName,
    nifConfigurado: legalEntity.taxIdentityConfigured || Boolean(legalEntity.taxIdentityEncrypted),
    direccionFiscal: legalEntity.address,
    emailContacto: legalEntity.contactEmail,
    pais: legalEntity.countryCode,
    moneda: legalEntity.currencyCode,
    epigrafeIAE: legalEntity.iaeCode,
    regimenIVA: 'REGIMEN_REDUCIDO_LIBROS_ES',
    oss: {
      activo: legalEntity.ossEnabled,
      vigenteDesde: legalEntity.ossEffectiveFrom,
    },
    estadoConfiguracion: legalEntity.fiscalConfigurationStatus === 'COMPLETA' ? 'COMPLETA' : 'INCOMPLETA',
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
    return { legalEntity: legalEntity ?? null, emisorFiscal: buildEmisorFiscal(legalEntity ?? null), series, productTaxProfiles: profiles, channelPolicies: policies, readiness: { ready: missing.length === 0, missing } };
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

  async saveIssuerConfiguration(input: SaveFiscalIssuerConfigurationInput): Promise<FiscalConfigurationSnapshot> {
    await this.db.transaction(async (tx) => {
      const [existingEntity] = await tx.select().from(legalEntities).where(eq(legalEntities.tenantId, input.tenantId)).limit(1);
      const entityValues = {
        tenantId: input.tenantId,
        legalName: input.datosEmisor.nombreLegal,
        tradeName: input.datosEmisor.nombreComercial ?? null,
        countryCode: input.datosEmisor.pais,
        currencyCode: input.datosEmisor.moneda,
        address: input.datosEmisor.direccionFiscal,
        contactEmail: input.datosEmisor.emailContacto ?? null,
        configurationStatus: 'READY',
        issuerType: input.datosEmisor.tipoEmisor,
        iaeCode: input.datosEmisor.epigrafeIAE,
        vatRegime: input.datosEmisor.regimenIVA,
        irpfSettings: {},
        ossEnabled: input.oss.activo,
        ossEffectiveFrom: input.oss.vigenteDesde ?? null,
        fiscalConfigurationStatus: 'COMPLETA',
        taxIdentityConfigured: Boolean(input.datosEmisor.nifCifrado || existingEntity?.taxIdentityEncrypted),
        updatedAt: new Date(),
      };
      const valuesWithTaxIdentity = input.datosEmisor.nifCifrado
        ? { ...entityValues, taxIdentityEncrypted: input.datosEmisor.nifCifrado }
        : entityValues;
      const [entity] = existingEntity
        ? await tx.update(legalEntities).set(valuesWithTaxIdentity).where(and(eq(legalEntities.id, existingEntity.id), eq(legalEntities.tenantId, input.tenantId))).returning()
        : await tx.insert(legalEntities).values(valuesWithTaxIdentity).returning();
      if (!entity) throw new Error('No se pudo persistir la entidad emisora');

      for (const series of FISCAL_SERIES) {
        await tx.insert(invoiceSeries).values({ tenantId: input.tenantId, legalEntityId: entity.id, fiscalYear: input.ejercicio, ...series })
          .onConflictDoUpdate({ target: [invoiceSeries.legalEntityId, invoiceSeries.code], set: { fiscalYear: input.ejercicio, documentType: series.documentType, active: true, updatedAt: new Date() } });
      }

      await tx.insert(productTaxProfiles).values({
        tenantId: input.tenantId,
        legalEntityId: entity.id,
        selector: input.perfilProducto.selector,
        productNature: input.perfilProducto.naturalezaProducto,
        invoiceDescription: input.perfilProducto.descripcionFactura,
        domesticTaxCode: input.perfilProducto.codigoIVA,
        domesticTaxRate: input.perfilProducto.tipoIVA,
        ossEligible: input.perfilProducto.elegibleOSS,
        shippingRequired: input.perfilProducto.requiereEnvio,
        effectiveFrom: input.perfilProducto.vigenteDesde,
      }).onConflictDoUpdate({
        target: [productTaxProfiles.tenantId, productTaxProfiles.legalEntityId, productTaxProfiles.selector, productTaxProfiles.effectiveFrom],
        set: {
          productNature: input.perfilProducto.naturalezaProducto,
          invoiceDescription: input.perfilProducto.descripcionFactura,
          domesticTaxCode: input.perfilProducto.codigoIVA,
          domesticTaxRate: input.perfilProducto.tipoIVA,
          ossEligible: input.perfilProducto.elegibleOSS,
          shippingRequired: input.perfilProducto.requiereEnvio,
          active: true,
          updatedAt: new Date(),
        },
      });

      await tx.insert(channelFiscalPolicies).values({
        tenantId: input.tenantId,
        channel: 'AMAZON_KDP',
        version: '1',
        effectiveFrom: input.perfilProducto.vigenteDesde,
        kdpAccountingPolicy: 'NET_ROYALTY_ONLY',
        embeddedCostTreatment: 'INCLUDED_IN_NET',
        reviewLevel: 'REVIEW_REQUIRED',
        issuerAttributes: { regimenIVA: input.datosEmisor.regimenIVA, ossActivo: input.oss.activo },
      }).onConflictDoUpdate({
        target: [channelFiscalPolicies.tenantId, channelFiscalPolicies.channel, channelFiscalPolicies.version],
        set: {
          effectiveFrom: input.perfilProducto.vigenteDesde,
          kdpAccountingPolicy: 'NET_ROYALTY_ONLY',
          embeddedCostTreatment: 'INCLUDED_IN_NET',
          reviewLevel: 'REVIEW_REQUIRED',
          issuerAttributes: { regimenIVA: input.datosEmisor.regimenIVA, ossActivo: input.oss.activo },
          active: true,
          updatedAt: new Date(),
        },
      });

      await tx.insert(auditEvents).values({
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'CONFIGURACION_FISCAL_EMISOR_GUARDADA',
        entityType: 'LegalEntity',
        entityId: entity.id,
        metadata: { estadoConfiguracion: 'COMPLETA', series: FISCAL_SERIES.map((series) => series.code) },
      });
    });
    return this.get(input.tenantId);
  }
}
