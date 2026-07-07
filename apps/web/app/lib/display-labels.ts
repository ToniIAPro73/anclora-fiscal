const STATUS_LABELS: Record<string, string> = {
  ANALYZED: "Vista previa lista",
  AUTHORIZATION: "Autorización",
  AUTO_LINKED: "Enlace exacto",
  BLOCKED: "Bloqueada",
  CAPTURE: "Cobro",
  DETERMINED: "Determinada",
  EVIDENCE_PENDING: "Evidencia pendiente",
  FAILED: "Fallida",
  FULL: "Total",
  FULL_REFUND_NET_ZERO: "Reembolso total con neto cero",
  GENERAL: "General",
  IMPORTED: "Importado",
  IMPORTED_WITH_ISSUES: "Importado con incidencias",
  ISSUED: "Emitida",
  LEDGER_MISSING: "Faltan movimientos",
  MATCHED: "Conciliada",
  NONE: "Sin reembolso",
  PAID: "Pagado",
  PARTIAL: "Parcial",
  PAYOUT_PENDING: "Liquidación pendiente",
  PENDING: "Pendiente",
  PENDING_CONFIRMATION: "Pendiente de confirmación",
  PENDING_TAX_REVIEW: "Pendiente de revisión fiscal",
  READY_FOR_INVOICING: "Lista para facturar",
  REFUND: "Reembolso",
  REJECTED: "Importación rechazada",
  SALE: "Venta",
  SETTLED: "Liquidada",
  CONFIRMED: "Confirmado",
  PROPOSED: "Propuesto",
  TAX_DECISION_MISSING: "Falta decisión fiscal",
  UNMATCHED: "Sin conciliar",
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
