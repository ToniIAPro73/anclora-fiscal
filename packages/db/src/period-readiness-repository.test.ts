import { describe, expect, it } from 'vitest';
import { evaluatePeriodReadiness } from './period-readiness-repository';
const complete = { blockingIssues: 0, operationsWithoutDecision: 0, invoicesWithoutPdf: 0, invoicesWithoutHash: 0, pendingSubmissions: 0, rejectedSubmissions: 0, incompleteReconciliation: 0, shopifyImportsPresent: true, kdpImportsPresent: true, periodStatus: 'OPEN', dossierGenerated: false };
describe('evaluatePeriodReadiness', () => {
  it.each(['blockingIssues','operationsWithoutDecision','invoicesWithoutPdf','invoicesWithoutHash','rejectedSubmissions'])('cada blocker %s produce RED', (key) => expect(evaluatePeriodReadiness('2026-06', { ...complete, [key]: 1 }).status).toBe('RED'));
  it('warnings sin blockers producen AMBER', () => expect(evaluatePeriodReadiness('2026-06', { ...complete, pendingSubmissions: 1 }).status).toBe('AMBER'));
  it('flujo completo produce GREEN', () => expect(evaluatePeriodReadiness('2026-06', complete).status).toBe('GREEN'));
  it('cierre con dossier produce CLOSED', () => expect(evaluatePeriodReadiness('2026-06', { ...complete, periodStatus: 'CLOSED', dossierGenerated: true }).status).toBe('CLOSED'));
  it('ordena razones de forma determinista', () => expect(evaluatePeriodReadiness('2026-06', { ...complete, pendingSubmissions: 1, blockingIssues: 1 }).reasons.map((r) => r.code)).toEqual(['BLOCKING_ISSUES_OPEN','VERIFACTU_PENDING']));
});
