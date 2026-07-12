import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { canonicalOperations, fiscalDocuments, importJobs, integrityChainRecords, issues, periodCloses, royaltyStatements, taxDecisions, vatDossiers, verifactuSubmissions } from './schema.js';
import * as schema from './schema.js';

export type ReadinessStatus = 'RED' | 'AMBER' | 'GREEN' | 'CLOSED';
export interface ReadinessReason { code: string; severity: 'BLOCKER' | 'WARNING'; count: number; action: string }
export interface PeriodReadiness { period: string; status: ReadinessStatus; reasons: ReadinessReason[]; metrics: Record<string, number | boolean | string> }

export function evaluatePeriodReadiness(period: string, metrics: PeriodReadiness['metrics']): PeriodReadiness {
  const reasons: ReadinessReason[] = [];
  const blocker = (code: string, key: string, action: string) => { const value = Number(metrics[key] ?? 0); if (value > 0) reasons.push({ code, severity: 'BLOCKER', count: value, action }); };
  blocker('BLOCKING_ISSUES_OPEN', 'blockingIssues', 'Resolver incidencias bloqueantes');
  blocker('OPERATIONS_WITHOUT_TAX_DECISION', 'operationsWithoutDecision', 'Completar decisiones fiscales');
  blocker('INVOICES_WITHOUT_PDF', 'invoicesWithoutPdf', 'Regenerar PDFs');
  blocker('INVOICES_WITHOUT_OFFICIAL_HASH', 'invoicesWithoutHash', 'Generar huellas oficiales');
  blocker('VERIFACTU_REJECTED', 'rejectedSubmissions', 'Subsanar rechazos');
  if (Number(metrics.pendingSubmissions ?? 0) > 0) reasons.push({ code: 'VERIFACTU_PENDING', severity: 'WARNING', count: Number(metrics.pendingSubmissions), action: 'Esperar o procesar la cola' });
  if (!metrics.shopifyImportsPresent) reasons.push({ code: 'SHOPIFY_IMPORTS_MISSING', severity: 'WARNING', count: 1, action: 'Importar evidencias Shopify esperadas' });
  if (!metrics.kdpImportsPresent) reasons.push({ code: 'KDP_IMPORT_MISSING', severity: 'WARNING', count: 1, action: 'Importar KDP si aplica' });
  if (Number(metrics.incompleteReconciliation ?? 0) > 0) reasons.push({ code: 'RECONCILIATION_INCOMPLETE', severity: 'WARNING', count: Number(metrics.incompleteReconciliation), action: 'Revisar conciliación' });
  const closed = metrics.periodStatus === 'CLOSED' && metrics.dossierGenerated === true;
  const status: ReadinessStatus = closed ? 'CLOSED' : reasons.some((reason) => reason.severity === 'BLOCKER') ? 'RED' : reasons.length ? 'AMBER' : 'GREEN';
  return { period, status, reasons: reasons.sort((a, b) => a.code.localeCompare(b.code)), metrics };
}

export class DrizzlePeriodReadinessRepository<T extends PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<T, typeof schema>) {}
  async getPeriodReadiness(tenantId: string, period: string): Promise<PeriodReadiness> {
    const periodFilter = sql`to_char(${canonicalOperations.createdAt}, 'YYYY-MM') = ${period}`;
    const [[blocking], [withoutDecision], [withoutPdf], [withoutHash], [pending], [rejected], [incomplete], imports, [kdp], [close], [dossier]] = await Promise.all([
      this.db.select({ n: count() }).from(issues).innerJoin(canonicalOperations, eq(issues.canonicalOperationId, canonicalOperations.id)).where(and(eq(issues.tenantId, tenantId), eq(issues.status, 'OPEN'), eq(issues.severity, 'BLOCKING'), periodFilter)),
      this.db.select({ n: count() }).from(canonicalOperations).leftJoin(taxDecisions, and(eq(taxDecisions.tenantId, tenantId), eq(taxDecisions.canonicalOperationId, canonicalOperations.id))).where(and(eq(canonicalOperations.tenantId, tenantId), periodFilter, isNull(taxDecisions.id))),
      this.db.select({ n: count() }).from(fiscalDocuments).where(and(eq(fiscalDocuments.tenantId, tenantId), sql`to_char(${fiscalDocuments.issuedAt}, 'YYYY-MM') = ${period}`, eq(fiscalDocuments.renderStorageKey, ''))),
      this.db.select({ n: count() }).from(fiscalDocuments).leftJoin(integrityChainRecords, eq(integrityChainRecords.fiscalDocumentId, fiscalDocuments.id)).where(and(eq(fiscalDocuments.tenantId, tenantId), sql`to_char(${fiscalDocuments.issuedAt}, 'YYYY-MM') = ${period}`, isNull(integrityChainRecords.aeatHuella))),
      this.db.select({ n: count() }).from(verifactuSubmissions).where(and(eq(verifactuSubmissions.tenantId, tenantId), inArray(verifactuSubmissions.status, ['PENDING', 'RETRY_SCHEDULED']))),
      this.db.select({ n: count() }).from(verifactuSubmissions).where(and(eq(verifactuSubmissions.tenantId, tenantId), eq(verifactuSubmissions.status, 'REJECTED'))),
      this.db.select({ n: count() }).from(canonicalOperations).where(and(eq(canonicalOperations.tenantId, tenantId), periodFilter, ne(canonicalOperations.reconciliationStatus, 'MATCHED'))),
      this.db.select({ connectorId: importJobs.connectorId }).from(importJobs).where(and(eq(importJobs.tenantId, tenantId), inArray(importJobs.status, ['IMPORTED', 'IMPORTED_WITH_ISSUES']))),
      this.db.select({ n: count() }).from(royaltyStatements).where(and(eq(royaltyStatements.tenantId, tenantId), sql`${period} = ANY(${royaltyStatements.periods})`)),
      this.db.select().from(periodCloses).where(and(eq(periodCloses.tenantId, tenantId), eq(periodCloses.period, period))).limit(1),
      this.db.select({ n: count() }).from(vatDossiers).innerJoin(periodCloses, eq(vatDossiers.periodCloseId, periodCloses.id)).where(and(eq(vatDossiers.tenantId, tenantId), eq(periodCloses.period, period))),
    ]);
    const connectors = new Set(imports.map((row) => row.connectorId));
    return evaluatePeriodReadiness(period, { blockingIssues: blocking?.n ?? 0, operationsWithoutDecision: withoutDecision?.n ?? 0, invoicesWithoutPdf: withoutPdf?.n ?? 0, invoicesWithoutHash: withoutHash?.n ?? 0, pendingSubmissions: pending?.n ?? 0, rejectedSubmissions: rejected?.n ?? 0, incompleteReconciliation: incomplete?.n ?? 0, shopifyImportsPresent: [...connectors].some((id) => id?.startsWith('shopify')), kdpImportsPresent: (kdp?.n ?? 0) > 0, periodStatus: close?.status ?? 'OPEN', dossierGenerated: (dossier?.n ?? 0) > 0 });
  }
}
