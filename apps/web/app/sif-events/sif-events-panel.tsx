'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';

interface SifEventItem {
  id: string;
  eventType: string;
  actor: string;
  detail: unknown;
  hash: string;
  previousHash: string | null;
  occurredAt: string;
}

interface SifEventsListResponse {
  items: SifEventItem[];
  page: number;
  pageSize: number;
  total: number;
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  STARTUP: 'Arranque',
  SHUTDOWN: 'Parada',
  INTEGRITY_ERROR: 'Error de integridad',
  SUBMISSION_ERROR: 'Error de envío',
  RESTORE_RETRY: 'Restauración / reintento',
  ANOMALY: 'Anomalía',
};

function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABEL[eventType] ?? eventType;
}

function eventTypeTone(eventType: string): 'info' | 'warning' | 'high' | 'blocking' {
  if (eventType === 'INTEGRITY_ERROR' || eventType === 'SUBMISSION_ERROR') return 'high';
  if (eventType === 'ANOMALY') return 'blocking';
  if (eventType === 'RESTORE_RETRY') return 'warning';
  return 'info';
}

function shortHash(value: string | null): string {
  if (!value) return '—';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function SifEventsPanel() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [data, setData] = useState<SifEventsListResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/sif-events?page=${page}&pageSize=${pageSize}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron obtener los eventos SIF');
        return response.json() as Promise<SifEventsListResponse>;
      })
      .then((result) => { if (!cancelled) setData(result); })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  async function verifyChain() {
    setVerifying(true);
    setVerifyError('');
    try {
      const response = await fetch('/api/v1/sif-events/verify', { credentials: 'include' });
      if (!response.ok) throw new Error('No se pudo verificar la cadena de eventos SIF');
      const body = await response.json() as { valid: boolean };
      setChainValid(body.valid);
    } catch (reason) {
      setVerifyError(reason instanceof Error ? reason.message : 'No se pudo verificar la cadena de eventos SIF');
    } finally {
      setVerifying(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  if (error) return <section className="sif-events-panel"><p className="import-error" role="status">{error}</p></section>;

  return <section className="sif-events-panel">
    <div className="sif-events-toolbar">
      <button type="button" disabled={verifying} onClick={() => void verifyChain()}>
        {verifying ? 'Verificando…' : 'Verificar cadena'}
      </button>
      {chainValid !== null ? (
        <StatusBadge tone={chainValid ? 'info' : 'blocking'}>
          {chainValid ? 'Cadena íntegra' : 'Cadena rota — requiere investigación'}
        </StatusBadge>
      ) : null}
      {verifyError ? <p className="import-error" role="status">{verifyError}</p> : null}
    </div>

    {loading ? <p className="workbench-notice" aria-live="polite">Cargando eventos SIF…</p> : null}

    {!loading && data && data.items.length === 0 ? (
      <p className="workbench-notice">No hay eventos SIF registrados todavía.</p>
    ) : null}

    {!loading && data && data.items.length > 0 ? (
      <div className="reconciliation-table-panel">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Actor</th>
              <th>Huella</th>
              <th>Huella anterior</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((event) => (
              <tr key={event.id}>
                <td>{formatDate(event.occurredAt)}</td>
                <td><StatusBadge tone={eventTypeTone(event.eventType)}>{eventTypeLabel(event.eventType)}</StatusBadge></td>
                <td>{event.actor}</td>
                <td><code>{shortHash(event.hash)}</code></td>
                <td><code>{shortHash(event.previousHash)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}

    {data && data.total > 0 ? (
      <div className="sif-events-pagination">
        <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Anterior
        </button>
        <span>Página {page} de {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
          Siguiente
        </button>
      </div>
    ) : null}
  </section>;
}
