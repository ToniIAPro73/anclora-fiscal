'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';

interface ReconciliationCandidate {
  id: string;
  commercialOrderId: string;
  financialEventId: string;
  confidence: string;
  accepted: boolean;
  commercialOrderExternalId: string;
  financialEventExternalId: string;
}

interface CandidatesPage { items: ReconciliationCandidate[]; page: number; pageSize: number; total: number }

interface UnmatchedOrder {
  id: string;
  externalOrderId: string;
  sourceChannel: string;
  commercialDate?: string;
}

interface UnmatchedOrdersPage { items: UnmatchedOrder[]; page: number; pageSize: number; total: number }

export function ReconciliationWorkbench() {
  const [candidates, setCandidates] = useState<ReconciliationCandidate[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/v1/reconciliation/candidates', { credentials: 'include' });
        if (!response.ok) throw new Error('No se pudieron obtener las candidaturas de conciliación');
        const data = await response.json() as CandidatesPage;
        if (!cancelled) setCandidates(data.items);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudieron obtener las candidaturas de conciliación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <section className="reconciliation-workbench"><p aria-live="polite">Cargando candidaturas de conciliación…</p></section>;
  if (error) return <section className="reconciliation-workbench"><p className="import-error">{error}</p></section>;

  return <section className="reconciliation-workbench">
    {!candidates || candidates.length === 0 ? <p>No hay candidaturas de conciliación todavía.</p> : <>
      <span className="section-index">Candidaturas de conciliación</span>
      <table>
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
      </table>
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/v1/reconciliation/unmatched-orders', { credentials: 'include' });
        if (!response.ok) throw new Error('No se pudieron obtener los pedidos sin conciliar');
        const data = await response.json() as UnmatchedOrdersPage;
        if (!cancelled) setOrders(data.items);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudieron obtener los pedidos sin conciliar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return <section className="unmatched-orders" aria-label="Pedidos importados sin conciliar">
    <span className="section-index">Pedidos importados sin conciliar</span>
    {loading ? <p aria-live="polite">Cargando pedidos sin conciliar…</p> : null}
    {!loading && error ? <p className="import-error">{error}</p> : null}
    {!loading && !error && (!orders || orders.length === 0) ? <p>No hay pedidos pendientes de conciliar.</p> : null}
    {!loading && !error && orders && orders.length > 0 ? <table>
      <thead>
        <tr><th scope="col">Pedido</th><th scope="col">Canal</th><th scope="col">Fecha</th></tr>
      </thead>
      <tbody>
        {orders.map((order) => <tr key={order.id}>
          <td>{order.externalOrderId}</td>
          <td>{order.sourceChannel}</td>
          <td>{order.commercialDate ? new Date(order.commercialDate).toLocaleDateString('es-ES') : '—'}</td>
        </tr>)}
      </tbody>
    </table> : null}
  </section>;
}
