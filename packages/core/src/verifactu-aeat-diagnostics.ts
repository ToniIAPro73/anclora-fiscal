import type { AeatVerifactuXmlValidationReport } from './verifactu-aeat-local-validation.js';
import type { AeatVerifactuPortalReadiness } from './verifactu-aeat-portal.js';

export type AeatVerifactuDiagnosticNextAction =
  | 'configure-portal'
  | 'fix-xml'
  | 'ready-for-manual-preproduction-test';

export interface AeatVerifactuOperationalDiagnosticsInput {
  portalReadiness: AeatVerifactuPortalReadiness;
  xmlValidationReport?: AeatVerifactuXmlValidationReport | undefined;
}

export interface AeatVerifactuOperationalDiagnostics {
  profile: 'aeat-verifactu-operational-diagnostics-v1';
  portalReady: boolean;
  xmlPreflightReady: boolean;
  canRunManualPreproductionTest: boolean;
  nextAction: AeatVerifactuDiagnosticNextAction;
  blockingReasons: string[];
  warnings: string[];
}

export function buildAeatVerifactuOperationalDiagnostics(
  input: AeatVerifactuOperationalDiagnosticsInput,
): AeatVerifactuOperationalDiagnostics {
  const portalBlockingReasons = input.portalReadiness.blockedReasons;
  const xmlBlockingReasons = input.xmlValidationReport?.blockingIssues.map((item) => item.code) ?? [];
  const portalWarnings = input.portalReadiness.warnings;
  const xmlWarnings = input.xmlValidationReport?.warnings.map((item) => item.code) ?? [];

  const portalReady = input.portalReadiness.ready;
  const xmlPreflightReady = input.xmlValidationReport ? input.xmlValidationReport.valid : true;
  const canRunManualPreproductionTest = portalReady && xmlPreflightReady;

  return {
    profile: 'aeat-verifactu-operational-diagnostics-v1',
    portalReady,
    xmlPreflightReady,
    canRunManualPreproductionTest,
    nextAction: resolveNextAction(portalReady, xmlPreflightReady),
    blockingReasons: [...portalBlockingReasons, ...xmlBlockingReasons],
    warnings: [...portalWarnings, ...xmlWarnings],
  };
}

function resolveNextAction(
  portalReady: boolean,
  xmlPreflightReady: boolean,
): AeatVerifactuDiagnosticNextAction {
  if (!portalReady) return 'configure-portal';
  if (!xmlPreflightReady) return 'fix-xml';
  return 'ready-for-manual-preproduction-test';
}
