'use client';

import { useEffect, useMemo, useState } from 'react';
import { FieldLabel, StatusBadge } from '@anclora/ui';

interface VerifactuRuntimeStatus {
  status: string;
  verifactuEnabled: boolean;
  verifactuMode: string;
  verifactuCanSubmit: boolean;
  verifactuProductionSafe: boolean;
}

interface VerifactuSubmission {
  id: string;
  fiscalDocumentNumber: string;
  documentType: string;
  issuedAt: string;
  environment: string;
  status: string;
  recordType: string;
  chainHash: string;
  previousHash: string | null;
  attemptCount: string;
}

interface VerifactuSubmissionListResponse {
  items: VerifactuSubmission[];
  page: number;
  pageSize: number;
  total: number;
}

const statusOptions = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'ACCEPTED', label: 'Aceptado' },
  { value: 'REJECTED', label: 'Rechazado' },
  { value: 'TECHNICAL_ERROR', label: 'Error técnico' },
  { value: 'BLOCKED', label: 'Bloqueado' },
];

const environmentOptions = [
  { value: '', label: 'Todos' },
  { value: 'mock', label: 'Simulación local' },
  { value: 'test', label: 'AEAT pruebas' },
  { value: 'production', label: 'Producción' },
];

function statusLabel(status: string): string {
  if (status === 'PENDING') return 'Pendiente';
  if (status === 'SENT') return 'Enviado';
  if (status === 'ACCEPTED') return 'Aceptado';
  if (status === 'REJECTED') return 'Rechazado';
  if (status === 'TECHNICAL_ERROR') return 'Error técnico';
  if (status === 'BLOCKED') return 'Bloqueado';
  return status;
}

function statusTone(status: string): 'info' | 'warning' | 'high' | 'blocking' {
  if (status === 'ACCEPTED') return 'info';
  if (status === 'PENDING') return 'warning';
  if (status === 'REJECTED' || status === 'TECHNICAL_ERROR') return 'high';
  if (status === 'BLOCKED') return 'blocking';
  return 'info';
}

function environmentLabel(environment: string): string {
  if (environment === 'mock') return 'Simulación local';
  if (environment === 'test') return 'AEAT pruebas';
  if (environment === 'production') return 'Producción';
  return environment;
}

function documentTypeLabel(type: string): string {
  if (type === 'SIMPLIFICADA') return 'Simplificada';
  if (type === 'COMPLETA') return 'Completa';
  if (type === 'RECTIFICATIVA') return 'Rectificativa';
  if (type === 'FULL_INVOICE') return 'Completa';
  if (type === 'RECTIFYING_INVOICE') return 'Rectificativa';
  return type;
}

function recordTypeLabel(type: string): string {
  if (type === 'ALTA') return 'Alta';
  if (type === 'ANULACION') return 'Anulación';
  return type;
}

function modeLabel(mode: string): string {
  if (mode === 'disabled') return 'Desactivado';
  if (mode === 'mock') return 'Simulación local';
  if (mode === 'test') return 'AEAT pruebas';
  if (mode === 'production') return 'Producción';
  return mode;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function shortHash(value: string | null): string {
  if (!value) return '—';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function runtimeTone(runtime: VerifactuRuntimeStatus | null): 'info' | 'warning' | 'blocking' {
  if (!runtime) return 'warning';
  if (!runtime.verifactuEnabled) return 'warning';
  if (!runtime.verifactuProductionSafe) return 'blocking';
  return 'info';
}

function preparationLabel(runtime: VerifactuRuntimeStatus | null): string {
  if (!runtime) return 'No disponible';
  if (!runtime.verifactuEnabled) return 'Desactivado';
  if (runtime.verifactuCanSubmit) return 'Integración preparada';
  return 'Sin envío activo';
}

function productionSafetyLabel(runtime: VerifactuRuntimeStatus | null): string {
  if (!runtime) return 'No disponible';
  if (runtime.verifactuProductionSafe) return 'Configuración segura';
  return 'Producción bloqueada';
}

function VerifactuSystemStatusCard({ runtime }: { runtime: VerifactuRuntimeStatus | null }) {
  return (
    <section className="verifactu-status-card" aria-label="Estado del sistema VERI*FACTU">
      <div className="verifactu-status-heading">
        <p className="eyebrow">Estado del sistema</p>
        <h2>Preparación VERI*FACTU</h2>
        <p>
          Consulta el modo operativo actual, la preparación de la integración y el estado de seguridad antes de cualquier activación de envío.
        </p>
      </div>

      <div className="verifactu-status-grid">
        <article className="verifactu-metric">
          <span>Modo operativo</span>
          <strong>{runtime ? modeLabel(runtime.verifactuMode) : 'No disponible'}</strong>
          <StatusBadge tone={runtimeTone(runtime)}>
            {runtime?.verifactuEnabled ? 'Activo' : 'Inactivo'}
          </StatusBadge>
        </article>

        <article className="verifactu-metric">
          <span>Preparación de envío</span>
          <strong>{preparationLabel(runtime)}</strong>
          <StatusBadge tone={runtime?.verifactuCanSubmit ? 'info' : 'warning'}>
            {runtime?.verifactuCanSubmit ? 'Preparado' : 'No activo'}
          </StatusBadge>
        </article>

        <article className="verifactu-metric">
          <span>Seguridad de producción</span>
          <strong>{productionSafetyLabel(runtime)}</strong>
          <StatusBadge tone={runtime?.verifactuProductionSafe === false ? 'blocking' : 'info'}>
            {runtime?.verifactuProductionSafe === false ? 'Revisión necesaria' : 'Seguro'}
          </StatusBadge>
        </article>
      </div>

      <p className="verifactu-readonly-note">
        Esta pantalla es sólo de lectura. No existe acción de envío manual a la AEAT desde la interfaz.
      </p>
    </section>
  );
}

function VerifactuFiltersCard({
  status,
  environment,
  onStatusChange,
  onEnvironmentChange,
}: {
  status: string;
  environment: string;
  onStatusChange: (value: string) => void;
  onEnvironmentChange: (value: string) => void;
}) {
  return (
    <section className="verifactu-filters-card" aria-label="Filtros de registros VERI*FACTU">
      <div>
        <p className="eyebrow">Filtros</p>
        <h2>Filtrar registros</h2>
        <p>Acota la vista por estado o entorno de preparación.</p>
      </div>

      <div className="verifactu-filters-grid">
        <div className="verifactu-filter-field">
          <FieldLabel htmlFor="verifactu-status-filter">Estado</FieldLabel>
          <select
            id="verifactu-status-filter"
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            {statusOptions.map((option) => (
              <option key={option.value || 'all-statuses'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="verifactu-filter-field">
          <FieldLabel htmlFor="verifactu-environment-filter">Entorno</FieldLabel>
          <select
            id="verifactu-environment-filter"
            value={environment}
            onChange={(event) => onEnvironmentChange(event.target.value)}
          >
            {environmentOptions.map((option) => (
              <option key={option.value || 'all-environments'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

function VerifactuEmptyState() {
  return (
    <section className="verifactu-empty-state" role="status">
      <div className="verifactu-empty-mark" aria-hidden="true">VF</div>
      <div>
        <p className="eyebrow">Sin actividad registrada</p>
        <h2>Sin registros VERI*FACTU aún</h2>
        <p>
          Las facturas emitidas o rectificadas aparecerán aquí con su estado de preparación, entorno y trazabilidad de cadena.
        </p>
      </div>
    </section>
  );
}

function VerifactuResultsCard({
  items,
  total,
  loading,
}: {
  items: VerifactuSubmission[];
  total: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="verifactu-results-card" role="status">
        <p>Cargando registros VERI*FACTU…</p>
      </section>
    );
  }

  if (items.length === 0) {
    return <VerifactuEmptyState />;
  }

  return (
    <section className="verifactu-results-card">
      <div className="verifactu-results-heading">
        <div>
          <p className="eyebrow">Registros preparados</p>
          <h2>Registros VERI*FACTU</h2>
        </div>
        <span className="verifactu-count">{total} registro{total === 1 ? '' : 's'}</span>
      </div>

      <div className="verifactu-table-wrapper">
        <table>
          <thead>
            <tr>
              <th scope="col">Factura</th>
              <th scope="col">Estado</th>
              <th scope="col">Entorno</th>
              <th scope="col">Registro</th>
              <th scope="col">Fecha</th>
              <th scope="col">Intentos</th>
              <th scope="col">Hash de cadena</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.fiscalDocumentNumber}</strong>
                  <span>{documentTypeLabel(item.documentType)}</span>
                </td>
                <td><StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge></td>
                <td>{environmentLabel(item.environment)}</td>
                <td>{recordTypeLabel(item.recordType)}</td>
                <td>{formatDate(item.issuedAt)}</td>
                <td>{item.attemptCount}</td>
                <td><code>{shortHash(item.chainHash)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function VerifactuSubmissionsPanel() {
  const [runtime, setRuntime] = useState<VerifactuRuntimeStatus | null>(null);
  const [items, setItems] = useState<VerifactuSubmission[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [status, setStatus] = useState('');
  const [environment, setEnvironment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useMemo(() => {
    const query = new URLSearchParams({
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    });

    if (status) query.set('status', status);
    if (environment) query.set('environment', environment);

    return query;
  }, [environment, pagination.page, pagination.pageSize, status]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntime() {
      try {
        const response = await fetch('/health', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json() as VerifactuRuntimeStatus;
        if (!cancelled) setRuntime(data);
      } catch {
        if (!cancelled) setRuntime(null);
      }
    }

    void loadRuntime();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSubmissions() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/v1/verifactu/submissions?${params.toString()}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('No se pudieron cargar los registros VERI*FACTU');
        }

        const data = await response.json() as VerifactuSubmissionListResponse;

        if (!cancelled) {
          setItems(data.items);
          setPagination({
            page: data.page,
            pageSize: data.pageSize,
            total: data.total,
          });
        }
      } catch (reason) {
        if (!cancelled) {
          setItems([]);
          setPagination((current) => ({ ...current, total: 0 }));
          setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los registros VERI*FACTU');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSubmissions();

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div className="verifactu-layout">
      <VerifactuSystemStatusCard runtime={runtime} />

      <VerifactuFiltersCard
        status={status}
        environment={environment}
        onStatusChange={(value) => {
          setStatus(value);
          setPagination((current) => ({ ...current, page: 1 }));
        }}
        onEnvironmentChange={(value) => {
          setEnvironment(value);
          setPagination((current) => ({ ...current, page: 1 }));
        }}
      />

      {error ? <p className="import-error" role="status">{error}</p> : null}

      <VerifactuResultsCard
        items={items}
        total={pagination.total}
        loading={loading}
      />
    </div>
  );
}
