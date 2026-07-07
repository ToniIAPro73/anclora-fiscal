const STATUS_LABELS: Record<string, string> = {
  ANALYZED: "Vista previa lista",
  AUTHORIZATION: "Autorización",
  AUTO_LINKED: "Enlace exacto",
  BLOCKED: "Bloqueada",
  BLOQUEADA: "Bloqueada",
  CAPTURE: "Cobro",
  DETERMINED: "Determinada",
  DETERMINADA: "Determinada",
  EVIDENCE_PENDING: "Evidencia pendiente",
  EVIDENCIA_INTERNA_PENDIENTE: "Evidencia interna pendiente",
  FAILED: "Fallida",
  FULL: "Total",
  FULL_REFUND_NET_ZERO: "Reembolso total con neto cero",
  GENERAL: "General",
  IMPORTED: "Importado",
  IMPORTED_WITH_ISSUES: "Importado con incidencias",
  ISSUED: "Emitida",
  LEDGER_MISSING: "Faltan movimientos",
  LEDGER_NOT_REQUIRED: "No requiere movimiento",
  ORDER_TO_LEDGER: "Pedido → movimiento",
  ORDER_TO_TRANSACTION: "Pedido → transacción",
  MATCHED: "Conciliada",
  NONE: "Sin reembolso",
  NO_CONFIGURADO: "No configurado",
  PAID: "Pagado",
  PARTIAL: "Parcial",
  PAYOUT_PENDING: "Liquidación pendiente",
  PENDING: "Pendiente",
  PENDIENTE: "Pendiente",
  PENDING_CONFIRMATION: "Pendiente de confirmación",
  PENDING_TAX_REVIEW: "Pendiente de revisión fiscal",
  PENDIENTE_DECISION_FISCAL: "Pendiente de decisión fiscal",
  PENDIENTE_REVISION_FISCAL: "Pendiente de revisión fiscal",
  READY_FOR_INVOICING: "Lista para facturar",
  REVISION_OSS_B2C_UE: "Revisión OSS B2C UE",
  REFUND: "Reembolso",
  REJECTED: "Importación rechazada",
  SALE: "Venta",
  SETTLED: "Liquidada",
  CONFIRMED: "Confirmado",
  PROPOSED: "Propuesto",
  TAX_DECISION_MISSING: "Falta decisión fiscal",
  UNMATCHED: "Sin conciliar",
  VENTA_NACIONAL_B2C_IVA_GENERAL: "Venta nacional B2C con IVA general",
  VENTA_NACIONAL_B2C_IVA_REDUCIDO: "Venta nacional B2C con IVA reducido",
  VENTA_SHOPIFY: "Venta Shopify",
  ZERO_VALUE_REVIEW: "Revisión por importe cero",
  ebook: "eBook",
  general: "Tapa blanda / general",
  paid: "Pagado",
  partially_paid: "Pagado parcialmente",
  pending: "Pendiente",
  refunded: "Reembolsado",
  partially_refunded: "Reembolsado parcialmente",
  success: "Correcta",
  voided: "Anulado",
};

const ISSUE_LABELS: Record<string, string> = {
  GROSS_FEE_NET_MISMATCH: "Bruto, comisión y neto no cuadran",
  KDP_COST_DOUBLE_COUNT_RISK: "Riesgo de duplicar costes KDP",
  MAPPING_VERSION_UNSUPPORTED: "Versión de mapeo no soportada",
  ORDER_EVIDENCE_MISSING: "Pedido no encontrado en la importación de pedidos",
  ORDER_TOTAL_MISMATCH: "El total del pedido no coincide",
  ORDER_TRANSACTION_STATUS_UNSUPPORTED: "Estado de transacción no soportado",
  PAYOUT_EVIDENCE_MISSING: "Falta evidencia de liquidación",
  PLATFORM_TAX_DIFFERS_FROM_FISCAL_DECISION: "El impuesto de plataforma difiere de la decisión fiscal",
  PLATFORM_VAT_ZERO_UNVALIDATED: "IVA de plataforma no validado fiscalmente",
  REFUND_EXCEEDS_ORIGINAL: "El reembolso supera la venta original",
  VAT_NUMBER_MISSING_FOR_B2B_SIGNAL: "Falta NIF-IVA para señal B2B",
  CROSS_BORDER_B2C_REVIEW: "Revisión B2C transfronteriza",
};

const CHANNEL_LABELS: Record<string, string> = {
  AMAZON_KDP: "Amazon KDP",
  SHOPIFY: "Shopify",
};

const RECORD_GROUP_LABELS: Record<string, string> = {
  commercialOrders: "Pedidos comerciales",
  financialEvents: "Eventos financieros",
  orders: "Pedidos",
  payouts: "Liquidaciones",
  royaltyLines: "Líneas de regalías",
  royaltyStatements: "Liquidaciones de regalías",
  shopifyOrderLines: "Líneas de pedido Shopify",
  shopifyOrderPaymentEvents: "Transacciones de pedido Shopify",
  shopifyOrderTransactions: "Transacciones de pedido Shopify",
  shopifyOrders: "Pedidos Shopify",
  shopifyPaymentsLedgerEntries: "Movimientos Shopify Payments",
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  authorization: "Autorización",
  capture: "Cobro",
  charge: "Cargo",
  refund: "Reembolso",
  sale: "Venta",
  void: "Anulación",
};

const LEDGER_ENTRY_LABELS: Record<string, string> = {
  adjustment: "Ajuste",
  chargeback: "Contracargo",
  credit: "Abono",
  debit: "Cargo",
  fee: "Comisión",
  payment: "Pago",
  payout: "Liquidación",
  refund: "Reembolso",
  sale: "Venta",
};

function humanizeTechnicalValue(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLocaleLowerCase("es-ES")
    .replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("es-ES"));
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Pendiente";
  return STATUS_LABELS[status] ?? humanizeTechnicalValue(status);
}

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return "Sin plataforma";
  return CHANNEL_LABELS[channel] ?? humanizeTechnicalValue(channel);
}

export function recordGroupLabel(group: string): string {
  return RECORD_GROUP_LABELS[group] ?? humanizeTechnicalValue(group);
}

export function transactionTypeLabel(type: string | null | undefined): string {
  if (!type) return "Sin tipo";
  return TRANSACTION_TYPE_LABELS[type] ?? statusLabel(type);
}

export function ledgerEntryLabel(type: string | null | undefined): string {
  if (!type) return "Sin movimiento";
  return LEDGER_ENTRY_LABELS[type] ?? statusLabel(type);
}

export function issueLabel(code: string | null | undefined): string {
  if (!code) return "Incidencia";
  return ISSUE_LABELS[code] ?? humanizeTechnicalValue(code);
}
