export interface TaxContext {
  issuerCountry?: string;
  customerCountry?: string;
  customerType?: 'B2B' | 'B2C';
  productNature?: string;
  channel: string;
  operationType: string;
  evidence: string[];
  grossAmount?: number;
  currency?: string;
  marketplaceMerchantOfRecordValidated?: boolean;
}

export interface TaxDecision {
  status: 'DETERMINADA' | 'PENDIENTE_REVISION_FISCAL' | 'BLOQUEADA' | 'DETERMINED' | 'PENDING_TAX_REVIEW' | 'BLOCKED' | 'REVISION_IMPORTE_CERO' | 'REVISION_REEMBOLSO_REQUERIDA' | 'PENDIENTE_VALIDACION_B2B';
  classification?: string;
  rate?: string;
  taxBase?: number;
  taxAmount?: number;
  totalAmount?: number;
  documentType?: 'SIMPLIFICADA' | 'COMPLETA' | 'RECTIFICATIVA' | 'NO_FACTURABLE' | 'FULL_INVOICE' | 'SIMPLIFIED_INVOICE' | 'RECTIFYING_INVOICE' | 'NON_INVOICEABLE';
  ruleId?: string;
  ruleVersion?: string;
  explanation: string[];
  blockingReason?: string;
}

export interface TaxRateConfig { id: string; rate: number; productNature: string; customerCountry: string; }
export interface FiscalDemoConfig {
  id: string;
  version: string;
  effectiveFrom: string;
  issuerCountry: string;
  rates: TaxRateConfig[];
  marketplaceRoyaltyExemptRate: number;
  sources: Array<{ title: string; url: string; consultedAt: string }>;
}

export const demoSpainConfig: FiscalDemoConfig = {
  id: 'DEMO_CONFIG', version: '2026.07.03', effectiveFrom: '2026-01-01', issuerCountry: 'ES',
  rates: [
    { id: 'ES_EBOOK_4', rate: 0.04, productNature: 'ebook', customerCountry: 'ES' },
    { id: 'ES_GENERAL_21', rate: 0.21, productNature: 'general', customerCountry: 'ES' },
  ],
  marketplaceRoyaltyExemptRate: 0,
  sources: [
    { title: 'AEAT: Tipos impositivos en el IVA 2026', url: 'https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/IVA/IVA_reperc/Tipos_IVA_2026.pdf', consultedAt: '2026-07-03' },
    { title: 'AEAT: Ventanilla Única OSS', url: 'https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/cuestiones-generales.html', consultedAt: '2026-07-03' },
  ],
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function normalizeProductNature(value: string): 'ebook' | 'general' | string {
  const normalized = value.trim().toLowerCase().replaceAll('-', '_');
  if (['ebook', 'e_book', 'libro_electronico', 'libro electrónico'].includes(normalized)) return 'ebook';
  return normalized;
}

export class VersionedTaxEngine {
  constructor(private readonly config: FiscalDemoConfig) {}

  evaluate(context: TaxContext): TaxDecision {
    if (!context.customerCountry || !context.customerType || !context.productNature) return { status: 'BLOQUEADA', explanation: ['Faltan país, tipo de cliente o naturaleza del producto'], blockingReason: 'EVIDENCIA_FISCAL_INSUFICIENTE' };
    if (context.channel === 'amazon-kdp') {
      if (!context.marketplaceMerchantOfRecordValidated) return { status: 'PENDIENTE_REVISION_FISCAL', explanation: ['El papel de Amazon como merchant of record no está validado'], blockingReason: 'ROL_MARKETPLACE_NO_VALIDADO' };
      return { status: 'DETERMINADA', classification: 'REGALIA_MARKETPLACE', rate: '0', taxBase: context.grossAmount ?? 0, taxAmount: 0, totalAmount: context.grossAmount ?? 0, documentType: 'NO_FACTURABLE', ruleId: 'KDP_MOR_ROYALTY_DEMO', ruleVersion: this.config.version, explanation: ['Configuración DEMO: regalía marketplace con merchant of record validado'] };
    }
    if (context.customerCountry !== 'ES' && context.customerType === 'B2C') return { status: 'PENDIENTE_REVISION_FISCAL', classification: 'REVISION_OSS_B2C_UE', explanation: ['Operación B2C fuera de España: revisar país de consumo y configuración OSS'], blockingReason: 'CONFIGURACION_OSS_REQUERIDA' };
    const contextProductNature = normalizeProductNature(context.productNature);
    const configured = this.config.rates.find((rate) => rate.customerCountry === context.customerCountry && (normalizeProductNature(rate.productNature) === contextProductNature || normalizeProductNature(rate.productNature) === 'general'));
    if (!configured) return { status: 'PENDIENTE_REVISION_FISCAL', explanation: ['No existe una regla fiscal versionada aplicable'], blockingReason: 'REGLA_FISCAL_NO_APLICABLE' };
    const total = money(context.grossAmount ?? 0);
    const taxBase = money(total / (1 + configured.rate));
    const taxAmount = money(total - taxBase);
    return { status: 'DETERMINADA', classification: normalizeProductNature(configured.productNature) === 'ebook' ? 'VENTA_NACIONAL_B2C_IVA_REDUCIDO' : 'VENTA_NACIONAL_B2C_IVA_GENERAL', rate: configured.rate.toString(), taxBase, taxAmount, totalAmount: total, documentType: 'SIMPLIFICADA', ruleId: configured.id, ruleVersion: this.config.version, explanation: [`Regla ${configured.id} de ${this.config.id}`, 'Tipo obtenido de configuración versionada, no del VAT de plataforma'] };
  }
}

export interface TaxRule {
  id: string;
  version: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  applies(context: TaxContext): boolean;
  evaluate(context: TaxContext): TaxDecision;
  explain(context: TaxContext): string[];
}
