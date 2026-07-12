import { can, type Role } from '@anclora/core';
import type { StoragePort } from '@anclora/core/server';

/** Permission checked against `packages/core/src/index.ts`'s `permissions` map — currently granted to FISCAL_OPERATOR and ADMIN (via '*'), not to REVIEWER or ADVISOR_READONLY. */
const ISSUE_PERMISSION = 'documents:issue';

/** Zero-amount rows must never be issued, manually or automatically. */
export const ZERO_VALUE_REVIEW_FISCAL_STATUS = 'ZERO_VALUE_REVIEW';
export const REVISION_IMPORTE_CERO_FISCAL_STATUS = 'REVISION_IMPORTE_CERO';

/**
 * Mirrors the relevant subset of IssueInvoiceResult/RectifyInvoiceResult
 * from packages/db/src/fiscal-documents-repository.ts, declared locally so
 * this file has no compile-time dependency on @anclora/db beyond the
 * structurally-typed port below (same convention as tax-decision-service.ts).
 */
export interface InvoiceIssuanceIssueResult {
  ok: boolean;
  document?: { id: string };
  reason?:
    | 'OPERATION_NOT_FOUND'
    | 'TAX_DECISION_MISSING'
    | 'FISCAL_CONFIGURATION_INCOMPLETE'
    | 'DECISION_FISCAL_NO_EMITIBLE'
    | 'COBRO_SHOPIFY_NO_CONFIRMADO'
    | 'CONFIGURACION_FISCAL_INCOMPLETA'
    | 'IMPORTE_CERO_EN_REVISION'
    | 'SIMPLIFIED_INVOICE_LIMIT_EXCEEDED';
  alreadyIssued?: boolean;
}

export interface InvoiceIssuanceRectifyResult {
  ok: boolean;
  document?: { id: string };
  reason?: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' | 'CONFIGURACION_FISCAL_INCOMPLETA';
  alreadyRectified?: boolean;
}

export interface InvoiceIssuanceFiscalDocumentsPort {
  issue(input: { tenantId: string; actorId: string | null; canonicalOperationId: string; storage: StoragePort }): Promise<InvoiceIssuanceIssueResult>;
  rectify(input: { tenantId: string; actorId: string | null; fiscalDocumentId: string; storage: StoragePort }): Promise<InvoiceIssuanceRectifyResult>;
}

export interface InvoiceIssuanceServiceDependencies {
  fiscalDocumentsRepository: InvoiceIssuanceFiscalDocumentsPort;
  storage: StoragePort;
}

export interface ContextoEmisionFiscal {
  idOperacion: string;
  estadoFiscal: string;
  existePedidoComercial: boolean;
  existeTransaccionShopifyConfirmada: boolean;
  configuracionFiscalLista: boolean;
  perfilFiscalVigente: boolean;
  estadoDecisionFiscal: string | null;
  tipoDocumentoFiscal: string | null;
}

export type MotivoBloqueoEmisionFiscal =
  | 'ROL_SIN_PERMISO_DE_EMISION'
  | 'REVISION_IMPORTE_CERO'
  | 'CONFIGURACION_FISCAL_INCOMPLETA'
  | 'PERFIL_FISCAL_NO_VIGENTE'
  | 'PEDIDO_COMERCIAL_NO_DISPONIBLE'
  | 'COBRO_SHOPIFY_NO_CONFIRMADO'
  | 'DECISION_FISCAL_NO_DETERMINADA'
  | 'TIPO_DOCUMENTO_NO_EMITIBLE'
  | 'ESTADO_FISCAL_NO_EMITIBLE';

export type ResultadoPuertaEmisionFiscal =
  | { permitida: true }
  | { permitida: false; motivo: MotivoBloqueoEmisionFiscal };

const ESTADOS_FISCALES_NO_EMITIBLES = new Set([
  'REVISION_IMPORTE_CERO',
  'PENDIENTE_CONFIGURACION_FISCAL',
  'PENDIENTE_REVISION_OSS',
  'PENDIENTE_VALIDACION_B2B',
  'PENDIENTE_REVISION_FISCAL',
  'REVISION_REEMBOLSO_REQUERIDA',
  'RECTIFICADA',
]);

const TIPOS_DOCUMENTO_EMITIBLES_MVP = new Set([
  'SIMPLIFICADA',
]);

export function evaluarPoliticaEmisionFiscal(
  contexto: ContextoEmisionFiscal,
): ResultadoPuertaEmisionFiscal {
  if (ESTADOS_FISCALES_NO_EMITIBLES.has(contexto.estadoFiscal)) {
    return {
      permitida: false,
      motivo: contexto.estadoFiscal === 'REVISION_IMPORTE_CERO'
        ? 'REVISION_IMPORTE_CERO'
        : 'ESTADO_FISCAL_NO_EMITIBLE',
    };
  }

  if (!contexto.existePedidoComercial) {
    return {
      permitida: false,
      motivo: 'PEDIDO_COMERCIAL_NO_DISPONIBLE',
    };
  }

  if (!contexto.existeTransaccionShopifyConfirmada) {
    return {
      permitida: false,
      motivo: 'COBRO_SHOPIFY_NO_CONFIRMADO',
    };
  }

  if (!contexto.configuracionFiscalLista) {
    return {
      permitida: false,
      motivo: 'CONFIGURACION_FISCAL_INCOMPLETA',
    };
  }

  if (!contexto.perfilFiscalVigente) {
    return {
      permitida: false,
      motivo: 'PERFIL_FISCAL_NO_VIGENTE',
    };
  }

  if (contexto.estadoDecisionFiscal !== 'DETERMINADA') {
    return {
      permitida: false,
      motivo: 'DECISION_FISCAL_NO_DETERMINADA',
    };
  }

  if (
    !contexto.tipoDocumentoFiscal
    || !TIPOS_DOCUMENTO_EMITIBLES_MVP.has(
      contexto.tipoDocumentoFiscal,
    )
  ) {
    return {
      permitida: false,
      motivo: 'TIPO_DOCUMENTO_NO_EMITIBLE',
    };
  }

  return { permitida: true };
}

export function evaluarPuertaEmisionManual(
  role: Role,
  contexto: ContextoEmisionFiscal,
): ResultadoPuertaEmisionFiscal {
  if (!can(role, ISSUE_PERMISSION)) {
    return {
      permitida: false,
      motivo: 'ROL_SIN_PERMISO_DE_EMISION',
    };
  }

  return evaluarPoliticaEmisionFiscal(contexto);
}

/**
 * Snapshot of the checks the caller (the /sales/shopify/[orderId] detail
 * route must gather before requesting manual issuance: config, fiscal
 * profile, the commercial order, confirmed order transactions, and a
 * determined tax decision. Ledger/payout evidence is useful for settlement
 * review, but it is not a fiscal issuance prerequisite.
 */
export interface ManualIssuanceOperation {
  id: string;
  fiscalStatus: string;

  // Campos legacy: se conservan mientras haya consumidores anteriores.
  hasFiscalConfiguration: boolean;
  hasFiscalProfile: boolean;
  hasOrderEvidence: boolean;
  hasTransactionsEvidence: boolean;
  hasLedgerEvidence?: boolean;
  hasTaxDecision: boolean;

  // Campos del contrato fiscal nuevo. Son opcionales temporalmente para no
  // romper consumidores antiguos; los nuevos consumidores deben enviarlos.
  configuracionFiscalLista?: boolean;
  perfilFiscalVigente?: boolean;
  existePedidoComercial?: boolean;
  existeTransaccionShopifyConfirmada?: boolean;
  estadoDecisionFiscal?: string | null;
  tipoDocumentoFiscal?: string | null;
}

export type ManualIssuanceGateReason =
  | 'ROLE_NOT_AUTHORIZED'
  | 'ZERO_VALUE_REVIEW_EXCLUDED'
  | 'FISCAL_CONFIGURATION_INCOMPLETE'
  | 'FISCAL_PROFILE_MISSING'
  | 'INSUFFICIENT_EVIDENCE'
  | 'TAX_DECISION_MISSING';

export type ManualIssuanceGateResult =
  | { allowed: true }
  | { allowed: false; reason: ManualIssuanceGateReason };

function adaptarOperacionLegacyAContextoFiscal(
  operation: ManualIssuanceOperation,
): ContextoEmisionFiscal {
  const estadoFiscal =
    operation.fiscalStatus === ZERO_VALUE_REVIEW_FISCAL_STATUS
      ? REVISION_IMPORTE_CERO_FISCAL_STATUS
      : operation.fiscalStatus;

  return {
    idOperacion: operation.id,
    estadoFiscal,

    configuracionFiscalLista:
      operation.configuracionFiscalLista
      ?? operation.hasFiscalConfiguration,

    perfilFiscalVigente:
      operation.perfilFiscalVigente
      ?? operation.hasFiscalProfile,

    existePedidoComercial:
      operation.existePedidoComercial
      ?? operation.hasOrderEvidence,

    existeTransaccionShopifyConfirmada:
      operation.existeTransaccionShopifyConfirmada
      ?? operation.hasTransactionsEvidence,

    // Compatibilidad temporal: el controlador Shopify se actualizará en el
    // siguiente punto para aportar el estado real de la decisión y el tipo
    // documental. No elimines este fallback todavía.
    estadoDecisionFiscal:
      operation.estadoDecisionFiscal
      ?? (operation.hasTaxDecision ? 'DETERMINADA' : null),

    tipoDocumentoFiscal:
      operation.tipoDocumentoFiscal
      ?? (operation.hasTaxDecision ? 'SIMPLIFICADA' : null),
  };
}

function convertirMotivoBloqueoANombreLegacy(
  motivo: MotivoBloqueoEmisionFiscal,
): ManualIssuanceGateReason {
  switch (motivo) {
    case 'ROL_SIN_PERMISO_DE_EMISION':
      return 'ROLE_NOT_AUTHORIZED';

    case 'REVISION_IMPORTE_CERO':
      return 'ZERO_VALUE_REVIEW_EXCLUDED';

    case 'CONFIGURACION_FISCAL_INCOMPLETA':
      return 'FISCAL_CONFIGURATION_INCOMPLETE';

    case 'PERFIL_FISCAL_NO_VIGENTE':
      return 'FISCAL_PROFILE_MISSING';

    case 'PEDIDO_COMERCIAL_NO_DISPONIBLE':
    case 'COBRO_SHOPIFY_NO_CONFIRMADO':
      return 'INSUFFICIENT_EVIDENCE';

    case 'DECISION_FISCAL_NO_DETERMINADA':
    case 'TIPO_DOCUMENTO_NO_EMITIBLE':
    case 'ESTADO_FISCAL_NO_EMITIBLE':
      return 'TAX_DECISION_MISSING';
  }
}

/**
 * Adaptador temporal para consumidores anteriores.
 *
 * La política real está en evaluarPuertaEmisionManual(). Este adaptador
 * conserva el contrato allowed/reason mientras se actualizan el controlador
 * Shopify y las pruebas al nuevo vocabulario fiscal.
 */
export function evaluateManualIssuanceGate(
  role: Role,
  operation: ManualIssuanceOperation,
): ManualIssuanceGateResult {
  const resultado = evaluarPuertaEmisionManual(
    role,
    adaptarOperacionLegacyAContextoFiscal(operation),
  );

  if (resultado.permitida) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: convertirMotivoBloqueoANombreLegacy(resultado.motivo),
  };
}

/**
 * Adaptador temporal para la ruta automática.
 *
 * No comprueba roles, pero aplica la misma política fiscal que la ruta
 * manual. En los siguientes puntos se aportarán datos reales de
 * configuración, perfil, cobro y decisión fiscal.
 */
export function evaluateFiscalIssuancePolicy(
  operation: ManualIssuanceOperation,
): ManualIssuanceGateResult {
  const resultado = evaluarPoliticaEmisionFiscal(
    adaptarOperacionLegacyAContextoFiscal(operation),
  );

  if (resultado.permitida) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: convertirMotivoBloqueoANombreLegacy(resultado.motivo),
  };
}

export type ManualIssuanceResult =
  | { status: 'BLOCKED'; reason: ManualIssuanceGateReason }
  | {
      status: 'ISSUE_FAILED';
      reason:
        | 'OPERATION_NOT_FOUND'
        | 'TAX_DECISION_MISSING'
        | 'FISCAL_CONFIGURATION_INCOMPLETE'
        | 'DECISION_FISCAL_NO_EMITIBLE'
        | 'COBRO_SHOPIFY_NO_CONFIRMADO'
        | 'CONFIGURACION_FISCAL_INCOMPLETA'
        | 'IMPORTE_CERO_EN_REVISION'
        | 'SIMPLIFIED_INVOICE_LIMIT_EXCEEDED';
    }
  | { status: 'ISSUED' | 'ALREADY_ISSUED'; documentId: string };

export interface RefundOperation {
  id: string;
  existingFiscalDocumentId: string | null;
}

export type RefundBranchResult =
  | { status: 'ROUTED_TO_REVIEW'; operationId: string }
  | { status: 'RECTIFICATION_FAILED'; reason: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' | 'CONFIGURACION_FISCAL_INCOMPLETA' }
  | { status: 'RECTIFIED' | 'ALREADY_RECTIFIED'; documentId: string };

/**
 * SHOPIFY-06: explicit, user-triggered issuance/refund-branching action.
 * Replaces the prior automatic-on-match issuance
 * (`runInvoiceIssuanceForOperation`, chained non-fatally from
 * MatchingService in Phase 5b). That automatic path is removed outright
 * rather than repaired: MatchingService's `invoiceIssuanceService`
 * dependency was already marked `@deprecated` and never actually invoked in
 * production (see matching-service.ts — `runMatchingForOrder` never reads
 * it), so removing it changes no observed runtime behavior, only deletes
 * dead code and replaces it with the real gated action the plan asks for.
 */
export class InvoiceIssuanceService {
  constructor(private readonly dependencies: InvoiceIssuanceServiceDependencies) {}

  /**
   * Manual issuance: gated on role (documents:issue), ZERO_VALUE_REVIEW
   * exclusion, minimum fiscal configuration, fiscal profile, sufficient
   * evidence (order + confirmed order transaction), and a determined tax
   * decision. Only once every check passes does this delegate to
   * fiscalDocumentsRepository.issue(), which independently re-verifies
   * config/tax-decision state server-side (defense in depth — the gate
   * above must never be the only check).
   */
  async issueManually(request: {
    tenantId: string;
    actorId: string;
    role: Role;
    operation: ManualIssuanceOperation;
  }): Promise<ManualIssuanceResult> {
    const gate = evaluateManualIssuanceGate(request.role, request.operation);
    if (!gate.allowed) return { status: 'BLOCKED', reason: gate.reason };

    const issueResult = await this.dependencies.fiscalDocumentsRepository.issue({
      tenantId: request.tenantId,
      actorId: request.actorId,
      canonicalOperationId: request.operation.id,
      storage: this.dependencies.storage,
    });

    if (!issueResult.ok || !issueResult.document) {
      return { status: 'ISSUE_FAILED', reason: issueResult.reason ?? 'OPERATION_NOT_FOUND' };
    }

    return {
      status: issueResult.alreadyIssued ? 'ALREADY_ISSUED' : 'ISSUED',
      documentId: issueResult.document.id,
    };
  }

  async issueAutomatically(request: {
    tenantId: string;
    operation: ManualIssuanceOperation;
  }): Promise<ManualIssuanceResult> {
    const gate = evaluateFiscalIssuancePolicy(request.operation);
    if (!gate.allowed) return { status: 'BLOCKED', reason: gate.reason };

    const issueResult = await this.dependencies.fiscalDocumentsRepository.issue({
      tenantId: request.tenantId,
      actorId: null,
      canonicalOperationId: request.operation.id,
      storage: this.dependencies.storage,
    });

    if (!issueResult.ok || !issueResult.document) {
      return { status: 'ISSUE_FAILED', reason: issueResult.reason ?? 'OPERATION_NOT_FOUND' };
    }

    return {
      status: issueResult.alreadyIssued ? 'ALREADY_ISSUED' : 'ISSUED',
      documentId: issueResult.document.id,
    };
  }

  /**
   * Refund branching: a refund against an order whose invoice was already
   * issued produces a linked rectification proposal via the existing
   * rectify() semantics — a new document is created, the original is never
   * edited (see DrizzleFiscalDocumentsRepository.rectify). A refund with no
   * prior invoice has nothing to rectify against, so it is routed to an
   * incidence/review queue rather than silently dropped or auto-issued.
   */
  async handleRefund(request: {
    tenantId: string;
    actorId: string;
    operation: RefundOperation;
  }): Promise<RefundBranchResult> {
    if (!request.operation.existingFiscalDocumentId) {
      return { status: 'ROUTED_TO_REVIEW', operationId: request.operation.id };
    }

    const rectifyResult = await this.dependencies.fiscalDocumentsRepository.rectify({
      tenantId: request.tenantId,
      actorId: request.actorId,
      fiscalDocumentId: request.operation.existingFiscalDocumentId,
      storage: this.dependencies.storage,
    });

    if (!rectifyResult.ok || !rectifyResult.document) {
      return { status: 'RECTIFICATION_FAILED', reason: rectifyResult.reason ?? 'INVALID_DOCUMENT_STATE' };
    }

    return {
      status: rectifyResult.alreadyRectified ? 'ALREADY_RECTIFIED' : 'RECTIFIED',
      documentId: rectifyResult.document.id,
    };
  }
}
