'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';
import { fetchAllPages } from '../lib/fetch-all-pages';

interface ReconciliationCandidate {
  id: string;
  commercialOrderId: string;
  financialEventId: string;
  confidence: string;
  accepted: boolean;
  commercialOrderExternalId: string;
  financialEventExternalId: string;
}

interface UnmatchedOrder {
  id: string;
  externalOrderId: string;
  sourceChannel: string;
  commercialDate?: string;
}

export function ReconciliationWorkbench() {
  const [candidates, setCandidates] = useState<ReconciliationCandidate[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const items = await fetchAllPages<ReconciliationCandidate>('/api/v1/reconciliation/candidates', { credentials: 'include' }, 'No se pudieron obtener las candidaturas de conciliación');
        if (!cancelled) setCandidates(items);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudieron obtener las candidaturas de conciliación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <section className="reconciliation-workbench"><p className="workbench-notice" aria-live="polite">Cargando candidaturas de conciliación…</p></section>;
  if (error) return <section className="reconciliation-workbench"><p className="workbench-notice workbench-notice-error">{error}</p></section>;

  return <section className="reconciliation-workbench">
    {!candidates || candidates.length === 0 ? <p className="workbench-notice">Aún no hay coincidencias. Importa también el CSV de transacciones de Shopify Payments para cruzar cada cobro con su pedido.</p> : <>
      <span className="section-index">Candidaturas de conciliación</span>
      <div className="reconciliation-table-panel"><table>
        <thead>
          <tr><th scope="col">Pedido</th><th scope="col">Evento</th><th scope="col">Confianza</th><th scope="col">Estado</th></tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => <tr key={candidate.id}>
            <td>{candidate.commercialOrderExternalId}</td>
            <td>{candidate.financialEventExternalId}</td>
            <td>{(Number(candidate.confidence) * 100).toFixed(0)} %</td>
            <td><StatusBadge tone={candidate.accepted ? 'info' : 'warning'}>{candidate.accepted ? 'Aceptada' : 'Pendiente'}</StatusBadge></td>
          </tr>)}
        </tbody>
      </table></div>
    </>}
    <UnmatchedOrdersSection />
  </section>;
}

/**
 * Read-only visibility into commercial orders that never got a
 * matching_candidates row at all (no counterpart financial_event was ever
 * found at import time) — otherwise invisible on both this workbench and the
 * operations page. No accept/reject actions here: explicitly out of scope,
 * see Task 4.11 in the plan.
 */
function UnmatchedOrdersSection() {
  const [orders, setOrders] = useState<UnmatchedOrder[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const items = await fetchAllPages<UnmatchedOrder>('/api/v1/reconciliation/unmatched-orders', { credentials: 'include' }, 'No se pudieron obtener los pedidos sin conciliar');
        if (!cancelled) setOrders(items);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudieron obtener los pedidos sin conciliar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filteredOrders = orders?.filter((order) => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es');
    const orderDate = order.commercialDate?.slice(0, 10) ?? '';
    return (!normalizedQuery || order.externalOrderId.toLocaleLowerCase('es').includes(normalizedQuery))
      && (!dateFrom || orderDate >= dateFrom)
      && (!dateTo || orderDate <= dateTo);
  });
  return <section className="unmatched-orders" aria-label="Pedidos importados sin conciliar">
    <span className="section-index">Pedidos importados sin conciliar</span>
    <div className="reconciliation-filters" role="group" aria-label="Filtros de pedidos sin conciliar">
      <div className="field">
        <label htmlFor="reconciliation-order">Pedido</label>
        <input id="reconciliation-order" type="search" placeholder="Buscar por referencia" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="reconciliation-from">Desde</label>
        <input id="reconciliation-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="reconciliation-to">Hasta</label>
        <input id="reconciliation-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>
      <button type="button" className="filter-clear" onClick={() => { setQuery(''); setDateFrom(''); setDateTo(''); }}>Limpiar filtros</button>
    </div>
    {loading ? <p className="workbench-notice" aria-live="polite">Cargando pedidos sin conciliar…</p> : null}
    {!loading && error ? <p className="workbench-notice workbench-notice-error">{error}</p> : null}
    {!loading && !error && (!orders || orders.length === 0) ? <p className="workbench-notice">No hay pedidos pendientes de conciliar.</p> : null}
    {!loading && !error && orders && orders.length > 0 && filteredOrders?.length === 0 ? <p className="workbench-notice">No hay pedidos para los filtros seleccionados.</p> : null}
    {!loading && !error && filteredOrders && filteredOrders.length > 0 ? <div className="reconciliation-table-panel"><table>
      <thead>
        <tr><th scope="col">Pedido</th><th scope="col">Fecha del pedido</th><th scope="col">Situación</th></tr>
      </thead>
      <tbody>
        {filteredOrders.map((order) => <tr key={order.id}>
          <td><strong>{order.externalOrderId}</strong></td>
          <td>{order.commercialDate ? new Date(order.commercialDate).toLocaleDateString('es-ES') : 'Sin fecha'}</td>
          <td><StatusBadge tone="warning">Sin movimiento financiero</StatusBadge></td>
        </tr>)}
      </tbody>
    </table></div> : null}
  </section>;
}
