'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState, StatusBadge } from '@anclora/ui';

interface VerifactuSubmissionListItem {
  id: string;
  environment: string;
  status: string;
  attemptCount: string;
  payloadRedacted: unknown;
  responseRedacted: unknown | null;
  fiscalDocumentId: string;
  fiscalDocumentNumber: string;
  documentType: string;
  issuedAt: string;
  recordType: string;
  chainHash: string;
  previousHash: string | null;
}

interface PaginatedVerifactuSubmissions {
  items: VerifactuSubmissionListItem[];
  page: number;
  pageSize: number;
  total: number;
}

const statusLabels: Record<string, string> = {
  BLOCKED: 'Bloqueado',
  PENDING: 'Pendiente',
  SENT: 'Enviado',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  TECHNICAL_ERROR: 'Error técnico',
};

const environmentLabels: Record<string, string> = {
  mock: 'Mock local',
  test: 'AEAT pruebas',
  production: 'AEAT producción',
};

function statusTone(status: string): 'info' | 'warning' | 'high' | 'blocking' {
  if (status === 'ACCEPTED') return 'info';
  if (status === 'REJECTED' || status === 'TECHNICAL_ERROR') return 'blocking';
  if (status === 'BLOCKED') return 'warning';
  return 'info';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function shortHash(value: string | null) {
  if (!value) return '—';
  return value.length <= 16 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function VerifactuSubmissionsPanel() {
  const [status, setStatus] = useState('');
  const [environment, setEnvironment] = useState('');
  const [data, setData] = useState<PaginatedVerifactuSubmissions>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '25' });
    if (status) params.set('status', status);
    if (environment) params.set('environment', environment);
    return params.toString();
  }, [environment, status]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setBusy(true);
      setError('');

      try {
        const response = await fetch(`/api/v1/verifactu/submissions?${query}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('No se pudo consultar el estado VERI*FACTU');
        }

        const body = await response.json() as PaginatedVerifactuSubmissions;
        if (!cancelled) setData(body);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'No se pudo consultar el estado VERI*FACTU');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return <section className="verifactu-panel">
    <span className="section-index">Read model operativo</span>
    <div className="drop-panel">
      <p>
        Esta vista muestra los drafts VERI*FACTU preparados desde las facturas emitidas y rectificativas.
        No hay envío activo a la AEAT desde esta pantalla.
      </p>
      <div className="dossier-actions">
        <label>
          Estado
          <select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            <option value="BLOCKED">Bloqueado</option>
            <option value="PENDING">Pendiente</option>
            <option value="SENT">Enviado</option>
            <option value="ACCEPTED">Aceptado</option>
            <option value="REJECTED">Rechazado</option>
            <option value="TECHNICAL_ERROR">Error técnico</option>
          </select>
        </label>
        <label>
          Entorno
          <select aria-label="Filtrar por entorno" value={environment} onChange={(event) => setEnvironment(event.target.value)}>
            <option value="">Todos</option>
            <option value="mock">Mock local</option>
            <option value="test">AEAT pruebas</option>
            <option value="production">AEAT producción</option>
          </select>
        </label>
      </div>
    </div>

    {busy ? <p role="status">Cargando estados VERI*FACTU…</p> : null}
    {error ? <p className="import-error" role="status">{error}</p> : null}

    {!busy && !error && (!data || data.items.length === 0) ? <EmptyState
      title="Sin registros VERI*FACTU"
      description="Cuando se emitan o rectifiquen facturas, aparecerán aquí sus registros de preparación VERI*FACTU."
    /> : null}

    {!busy && !error && data && data.items.length > 0 ? <>
      <p role="status">{data.total} registro{data.total === 1 ? '' : 's'} VERI*FACTU preparado{data.total === 1 ? '' : 's'}.</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Factura</th>
            <th scope="col">Entorno</th>
            <th scope="col">Estado</th>
            <th scope="col">Registro</th>
            <th scope="col">Fecha</th>
            <th scope="col">Intentos</th>
            <th scope="col">Hash cadena</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => <tr key={item.id}>
            <td>
              <strong>{item.fiscalDocumentNumber}</strong>
              <br />
              <span>{item.documentType}</span>
            </td>
            <td>{environmentLabels[item.environment] ?? item.environment}</td>
            <td><StatusBadge tone={statusTone(item.status)}>{statusLabels[item.status] ?? item.status}</StatusBadge></td>
            <td>{item.recordType}</td>
            <td>{formatDate(item.issuedAt)}</td>
            <td>{item.attemptCount}</td>
            <td title={item.chainHash}>{shortHash(item.chainHash)}</td>
          </tr>)}
        </tbody>
      </table>
    </> : null}
  </section>;
}
