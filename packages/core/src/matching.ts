export interface CommercialEvidence { orderId: string; checkoutId?: string; quantityIssue?: boolean; }
export interface FinancialEvidence { id: string; orderId?: string; checkoutId?: string; type: 'charge' | 'refund' | 'fee' | 'payout'; amount: number; fee: number; net: number; currency: string; }
export interface MatchExplanation { eventId: string; confidence: number; signals: string[]; }
export interface CanonicalOperationDraft {
  sourceOrderId: string;
  status: 'PENDING_TAX_REVIEW' | 'PENDING_EVIDENCE';
  reconciliationStatus: 'MATCHED' | 'PARTIALLY_MATCHED' | 'UNMATCHED';
  grossAmount: number;
  platformFeeAmount: number;
  netAmount: number;
  settlementAmount: number;
  currency?: string;
  matches: MatchExplanation[];
  anomalyFlags: string[];
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function matchOrder(order: CommercialEvidence, events: FinancialEvidence[]): CanonicalOperationDraft {
  const matches = events.flatMap((event): MatchExplanation[] => {
    const signals: string[] = [];
    if (event.orderId === order.orderId) signals.push('Coincidencia exacta por número de pedido');
    if (order.checkoutId && event.checkoutId === order.checkoutId) signals.push('Coincidencia exacta por checkout');
    return signals.length ? [{ eventId: event.id, confidence: signals.length === 2 ? 1 : 0.95, signals }] : [];
  });
  const matchedIds = new Set(matches.map((match) => match.eventId));
  const linked = events.filter((event) => matchedIds.has(event.id));
  const charges = linked.filter((event) => event.type === 'charge');
  const refunds = linked.filter((event) => event.type === 'refund');
  const grossAmount = money(charges.reduce((sum, event) => sum + event.amount, 0));
  const platformFeeAmount = money(linked.reduce((sum, event) => sum + event.fee, 0));
  const netAmount = money(linked.reduce((sum, event) => sum + event.amount, 0));
  const settlementAmount = money(linked.reduce((sum, event) => sum + event.net, 0));
  const anomalyFlags = [
    ...(order.quantityIssue ? ['INCOHERENT_QUANTITY'] : []),
    ...(refunds.length && Math.abs(netAmount) < 0.005 ? ['FULL_REFUND_NET_ZERO', 'RECTIFICATION_REVIEW_REQUIRED'] : []),
  ];
  return {
    sourceOrderId: order.orderId,
    status: linked.length ? 'PENDING_TAX_REVIEW' : 'PENDING_EVIDENCE',
    reconciliationStatus: linked.length === events.length ? 'MATCHED' : linked.length ? 'PARTIALLY_MATCHED' : 'UNMATCHED',
    grossAmount,
    platformFeeAmount,
    netAmount,
    settlementAmount,
    ...(linked[0]?.currency ? { currency: linked[0].currency } : {}),
    matches,
    anomalyFlags,
  };
}
