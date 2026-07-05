'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';
import { emptyOperationFilters, OperationFilters, operationFiltersQuery, type OperationFilterValues } from '../../components/operation-filters';
import { fetchAllPages } from '../../lib/fetch-all-pages';

interface Operation {
  id: string;
  sourceChannel: string;
  sourceOrderId: string | null;
  operationType: string;
  operationStatus: string;
  reviewStatus: string;
  reconciliationStatus: string;
  verifactuStatus: string;
  grossAmount: string | null;
  platformFeeAmount: string | null;
  netAmount: string | null;
  originalCurrency: string | null;
  createdAt: string;
}

interface CommercialOrder {
  id: string;
  externalOrderId: string;
  commercialDate: string | null;
  productNature: string | null;
  totalAmount: string | null;
  taxAmount: string | null;
}

const statusLabels: Record<string, string> = { PENDING_TAX_REVIEW: 'Pendiente de revisión fiscal', PENDING_EVIDENCE: 'Pendiente de evidencia' };
const reconciliationLabels: Record<string, string> = { MATCHED: 'Conciliado', PARTIALLY_MATCHED: 'Parcialmente conciliado', UNMATCHED: 'Excepción' };

export function OperationsTimeline() {
  const [operations, setOperations] = useState<Operation[]>();
  const [orders, setOrders] = useState<CommercialOrder[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OperationFilterValues>({ ...emptyOperationFilters, sourceChannel: 'SHOPIFY' });
  const hasFilters = Boolean(filters.dateFrom || filters.dateTo || filters.productNature);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [orderItems, operationItems] = await Promise.all([
          fetchAllPages<CommercialOrder>('/api/v1/commercial-orders', { credentials: 'include' }, 'No se pudieron obtener las ventas Shopify'),
          fetchAllPages<Operation>(`/api/v1/operations${operationFiltersQuery(filters)}`, { credentials: 'include' }, 'No se pudieron obtener las ventas Shopify'),
        ]);
        if (!cancelled) {
          setOrders(orderItems);
          setOperations(operationItems);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudieron obtener las ventas Shopify');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [filters]);

  const filteredOrders = orders?.filter((order) => {
    const orderDate = order.commercialDate?.slice(0, 10) ?? '';
    return (!filters.dateFrom || orderDate >= filters.dateFrom)
      && (!filters.dateTo || orderDate <= filters.dateTo)
      && (!filters.productNature || order.productNature === filters.productNature);
  });
  const operationsByOrder = new Map(operations?.map((operation) => [operation.sourceOrderId, operation]) ?? []);

  if (loading) return <section className="operations-timeline"><p aria-live="polite">Cargando operaciones…</p></section>;
  if (error) return <section className="operations-timeline"><p className="import-error">{error}</p></section>;
  return <section className="operations-timeline">
    <span className="section-index">Ventas importadas</span>
    <OperationFilters value={filters} onChange={setFilters} showPlatform={false} />
    {!filteredOrders || filteredOrders.length === 0 ? <p>{hasFilters ? 'No hay ventas para los filtros seleccionados.' : 'No hay ventas Shopify importadas todavía.'}</p> : null}
    {filteredOrders && filteredOrders.length > 0 ?
    <ol className="evidence-thread">
      {filteredOrders.map((order) => {
        const operation = operationsByOrder.get(order.externalOrderId);
        const total = order.totalAmount !== null ? Number(order.totalAmount).toFixed(2) : '—';
        const tax = order.taxAmount !== null ? Number(order.taxAmount).toFixed(2) : '—';
        return <li key={order.id}>
          <time>{order.commercialDate ? new Date(order.commercialDate).toLocaleDateString('es-ES') : 'Sin fecha'}</time>
          <div>
            <strong>{order.externalOrderId}</strong>
            <p>Total {total} EUR · IVA {tax} EUR · {order.productNature === 'ebook' ? 'eBook' : 'Producto físico / general'}</p>
          </div>
          <div className="operation-status-group">
            {operation ? <>
              <StatusBadge tone={operation.reviewStatus === 'PENDING' ? 'warning' : 'info'}>{statusLabels[operation.reviewStatus] ?? operation.reviewStatus}</StatusBadge>
              <StatusBadge tone={operation.reconciliationStatus === 'MATCHED' ? 'info' : 'warning'}>{reconciliationLabels[operation.reconciliationStatus] ?? operation.reconciliationStatus}</StatusBadge>
            </> : <StatusBadge tone="warning">Pendiente de conciliación</StatusBadge>}
          </div>
        </li>;
      })}
    </ol> : null}
  </section>;
}
