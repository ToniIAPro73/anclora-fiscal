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
  if (!candidates || candidates.length === 0) return <section className="reconciliation-workbench"><p>No hay candidaturas de conciliación todavía.</p></section>;

  return <section className="reconciliation-workbench">
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
  </section>;
}
