'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';
import { emptyOperationFilters, OperationFilters, operationFiltersQuery, type OperationFilterValues } from '../../components/operation-filters';

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

interface OperationsPage { items: Operation[]; page: number; pageSize: number; total: number }

const statusLabels: Record<string, string> = { PENDING_TAX_REVIEW: 'Pendiente de revisión fiscal', PENDING_EVIDENCE: 'Pendiente de evidencia' };
const reconciliationLabels: Record<string, string> = { MATCHED: 'Conciliado', PARTIALLY_MATCHED: 'Parcialmente conciliado', UNMATCHED: 'Excepción' };

export function OperationsTimeline() {
  const [operations, setOperations] = useState<Operation[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OperationFilterValues>(emptyOperationFilters);
  const hasFilters = Object.values(filters).some(Boolean);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/v1/operations${operationFiltersQuery(filters)}`, { credentials: 'include' });
        if (!response.ok) throw new Error('No se pudieron obtener las operaciones');
        const data = await response.json() as OperationsPage;
        if (!cancelled) setOperations(data.items);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudieron obtener las operaciones');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [filters]);

  if (loading) return <section className="operations-timeline"><p aria-live="polite">Cargando operaciones…</p></section>;
  if (error) return <section className="operations-timeline"><p className="import-error">{error}</p></section>;
  return <section className="operations-timeline">
    <span className="section-index">Operaciones</span>
    <OperationFilters value={filters} onChange={setFilters} />
    {!operations || operations.length === 0 ? <p>{hasFilters ? 'No hay operaciones para los filtros seleccionados.' : 'No hay operaciones todavía.'}</p> : null}
    {operations && operations.length > 0 ?
    <ol className="evidence-thread">
      {operations.map((operation) => {
        const gross = operation.grossAmount !== null ? Number(operation.grossAmount).toFixed(2) : '—';
        const fee = operation.platformFeeAmount !== null ? Number(operation.platformFeeAmount).toFixed(2) : '—';
        const net = operation.netAmount !== null ? Number(operation.netAmount).toFixed(2) : '—';
        const currency = operation.originalCurrency ?? 'EUR';
        return <li key={operation.id}>
          <time>{operation.sourceChannel}</time>
          <div>
            <strong>{operation.sourceOrderId ?? operation.id}</strong>
            <p>Bruto {gross} {currency} · Comisión {fee} {currency} · Neto {net} {currency}</p>
          </div>
          <div className="operation-status-group">
            <StatusBadge tone={operation.reviewStatus === 'PENDING' ? 'warning' : 'info'}>{statusLabels[operation.reviewStatus] ?? operation.reviewStatus}</StatusBadge>
            <StatusBadge tone={operation.reconciliationStatus === 'MATCHED' ? 'info' : 'warning'}>{reconciliationLabels[operation.reconciliationStatus] ?? operation.reconciliationStatus}</StatusBadge>
          </div>
        </li>;
      })}
    </ol> : null}
  </section>;
}
