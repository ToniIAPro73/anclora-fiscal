'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';

interface Sale { id: string; externalOrderId: string; commercialDate: string | null; totalAmount: string | null; paymentStatus: string; refundStatus: string; fiscalStatus: string; transactionCount: number; ledgerCount: number; feeAmount: string; payoutStatus: string; }
interface Response { items: Sale[]; metrics: { salesAmount: string; refundedAmount: string; feeAmount: string; pendingSettlement: number }; }

export function OperationsTimeline() {
  const [data, setData] = useState<Response>();
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ paymentStatus: '', refundStatus: '', fiscalStatus: '', settlementStatus: '', zeroAmount: '' });
  useEffect(() => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    fetch(`/api/v1/shopify/sales?${query}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) throw new Error('No se pudieron obtener las ventas Shopify');
      return response.json() as Promise<Response>;
    }).then(setData).catch((reason: Error) => setError(reason.message));
  }, [filters]);
  if (error) return <p className="workbench-notice workbench-notice-error">{error}</p>;
  if (!data) return <p className="workbench-notice">Cargando ventas Shopify…</p>;
  return <section className="operations-timeline">
    <span className="section-index">Resumen operativo</span>
    <div className="summary-grid">
      <article><span>Ventas</span><strong>{Number(data.metrics.salesAmount).toFixed(2)} €</strong></article>
      <article><span>Reembolsos</span><strong>{Number(data.metrics.refundedAmount).toFixed(2)} €</strong></article>
      <article><span>Comisiones</span><strong>{Number(data.metrics.feeAmount).toFixed(2)} €</strong></article>
      <article><span>Liquidación pendiente</span><strong>{data.metrics.pendingSettlement}</strong></article>
    </div>
    <div className="reconciliation-filters" aria-label="Filtros de ventas Shopify">
      <label>Pago<select value={filters.paymentStatus} onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}><option value="">Todos</option><option value="PAID">Pagado</option><option value="PENDING">Pendiente</option></select></label>
      <label>Reembolso<select value={filters.refundStatus} onChange={(e) => setFilters({ ...filters, refundStatus: e.target.value })}><option value="">Todos</option><option value="NONE">Sin reembolso</option><option value="PARTIAL">Parcial</option><option value="FULL">Total</option></select></label>
      <label>Liquidación<select value={filters.settlementStatus} onChange={(e) => setFilters({ ...filters, settlementStatus: e.target.value })}><option value="">Todas</option><option value="PENDING">Pendiente</option><option value="SETTLED">Con payout</option></select></label>
      <label>Importe<select value={filters.zeroAmount} onChange={(e) => setFilters({ ...filters, zeroAmount: e.target.value })}><option value="">Todos</option><option value="true">Cero</option><option value="false">Mayor que cero</option></select></label>
      <button className="filter-clear" onClick={() => setFilters({ paymentStatus: '', refundStatus: '', fiscalStatus: '', settlementStatus: '', zeroAmount: '' })}>Limpiar</button>
    </div>
    {data.items.length === 0 ? <p className="workbench-notice">No hay pedidos Shopify para los filtros seleccionados.</p> : <div className="reconciliation-table-panel"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Importe</th><th>Evidencia</th><th>Liquidación</th><th>Fiscal</th></tr></thead><tbody>{data.items.map((sale) => <tr key={sale.id}>
      <td><a href={`/sales/shopify/${sale.id}`}><strong>{sale.externalOrderId}</strong></a></td><td>{sale.commercialDate ? new Date(sale.commercialDate).toLocaleDateString('es-ES') : 'Sin fecha'}</td><td>{Number(sale.totalAmount ?? 0).toFixed(2)} €</td>
      <td>{sale.transactionCount ? `${sale.transactionCount} transacción · ${sale.ledgerCount} ledger` : <StatusBadge tone="warning">Faltan transacciones</StatusBadge>}</td>
      <td><StatusBadge tone={sale.payoutStatus === 'SETTLED' ? 'info' : 'warning'}>{sale.payoutStatus === 'SETTLED' ? 'Payout identificado' : sale.payoutStatus === 'LEDGER_MISSING' ? 'Falta ledger' : 'Payout pendiente'}</StatusBadge></td>
      <td>{sale.fiscalStatus}</td></tr>)}</tbody></table></div>}
  </section>;
}
