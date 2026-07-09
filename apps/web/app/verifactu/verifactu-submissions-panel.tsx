'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { FieldLabel, StatusBadge } from '@anclora/ui';

interface AeatPortalReadiness {
  environment: string;
  endpointUrl: string | null;
  endpointHost: string | null;
  preproductionHost: boolean;
  certificateConfigured: boolean;
  certificateFingerprint: string | null;
  productionSubmissionEnabled: boolean;
  allowAutomatedLoadTests: boolean;
  ready: boolean;
  blockedReasons: string[];
  warnings: string[];
  usagePolicy: string;
}

interface AeatXmlPreflightStatus {
  enabled: boolean;
  schemaProfile: string;
  blocksInvalidXmlBeforeAdapter: boolean;
  maxRegistroFacturaPerEnvelope: number;
}

interface AeatSoapTransportStatus {
  implemented: boolean;
  wiredIntoSubmissionFlow: boolean;
  networkEnabled: boolean;
  operation: string;
  soapAction: string;
  safety: string;
}

interface VerifactuRuntimeStatus {
  status: string;
  verifactuEnabled: boolean;
  verifactuMode: string;
  verifactuCanSubmit: boolean;
  verifactuProductionSafe: boolean;
  aeatPortalReadiness?: AeatPortalReadiness | undefined;
  aeatXmlPreflight?: AeatXmlPreflightStatus | undefined;
  aeatSoapTransport?: AeatSoapTransportStatus | undefined;
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

interface VerifactuSubmissionAttempt {
  id: string;
  verifactuSubmissionId: string;
  attemptNumber: string;
  status: string;
  responseRedacted: unknown;
  attemptedAt: string;
}

interface VerifactuSubmissionAttemptsResponse {
  items: VerifactuSubmissionAttempt[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseText(value: unknown, key: 'reference' | 'message' | 'submittedAt'): string {
  if (!isRecord(value)) return '—';
  const field = value[key];
  return typeof field === 'string' && field.trim() ? field : '—';
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

function portalReadinessLabel(readiness: AeatPortalReadiness | null): string {
  if (!readiness) return 'No disponible';
  if (readiness.ready) return 'Portal de pruebas preparado';
  return 'Configuración pendiente';
}

function certificateLabel(readiness: AeatPortalReadiness | null): string {
  if (!readiness) return 'No disponible';
  return readiness.certificateConfigured ? 'Certificado configurado' : 'Certificado pendiente';
}

function portalPolicyLabel(readiness: AeatPortalReadiness | null): string {
  if (!readiness) return 'No disponible';
  if (readiness.usagePolicy === 'manual-preproduction-tests-only') return 'Pruebas manuales controladas';
  return 'Envío productivo';
}

function portalReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    AEAT_VERIFACTU_ENDPOINT_REQUIRED: 'Falta endpoint AEAT',
    AEAT_VERIFACTU_ENDPOINT_REQUIRES_HTTPS: 'El endpoint debe usar HTTPS',
    AEAT_VERIFACTU_ENDPOINT_INVALID: 'Endpoint AEAT inválido',
    AEAT_VERIFACTU_CERTIFICATE_PATH_REQUIRED: 'Falta ruta del certificado',
    AEAT_VERIFACTU_CERTIFICATE_PASSWORD_REQUIRED: 'Falta contraseña del certificado',
    AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_REQUIRED: 'Falta huella del certificado',
    AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_INVALID: 'Huella de certificado inválida',
    AEAT_VERIFACTU_PREPRODUCTION_LOAD_TESTS_NOT_ALLOWED: 'Las pruebas masivas están bloqueadas',
    AEAT_VERIFACTU_PRODUCTION_SUBMISSION_NOT_ENABLED: 'Producción no habilitada',
    AEAT_VERIFACTU_PRODUCTION_ENDPOINT_POINTS_TO_PREPRODUCTION: 'Producción apunta a preproducción',
  };

  return labels[reason] ?? reason;
}

function executiveTitle(runtime: VerifactuRuntimeStatus | null): string {
  if (!runtime) return 'Estado VERI*FACTU no disponible';
  if (!runtime.verifactuProductionSafe) return 'Producción bloqueada';
  if (!runtime.verifactuEnabled) return 'VERI*FACTU en modo sólo lectura';
  if (runtime.verifactuCanSubmit) return 'Preparación técnica completada';
  return 'Preparación local sin envío activo';
}

function executiveDescription(runtime: VerifactuRuntimeStatus | null): string {
  if (!runtime) return 'No se ha podido leer el estado operativo del backend.';
  if (!runtime.verifactuProductionSafe) return 'La aplicación bloquea cualquier activación productiva hasta completar la configuración segura.';
  if (!runtime.verifactuEnabled) return 'La trazabilidad se mantiene visible, pero no hay flujo de envío habilitado.';
  if (runtime.verifactuCanSubmit) return 'El sistema tiene los prerrequisitos técnicos preparados, manteniendo la interfaz en modo lectura.';
  return 'El flujo público sigue protegido: no hay acción manual de envío desde la aplicación.';
}

function technicalGateLabel(runtime: VerifactuRuntimeStatus | null): string {
  if (!runtime) return 'Sin lectura';
  if (!runtime.verifactuProductionSafe) return 'Bloqueado';
  if (runtime.verifactuCanSubmit) return 'Preparado';
  return 'Protegido';
}

function endpointLine(readiness: AeatPortalReadiness | null): string {
  return readiness?.endpointHost ? `Host configurado: ${readiness.endpointHost}` : 'No hay endpoint AEAT configurado.';
}

function MetricTile({
  label,
  value,
  badge,
  tone,
  note,
}: {
  label: string;
  value: string;
  badge: string;
  tone: 'info' | 'warning' | 'high' | 'blocking';
  note?: string | undefined;
}) {
  return (
    <article className="verifactu-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <StatusBadge tone={tone}>{badge}</StatusBadge>
      {note ? <p>{note}</p> : null}
    </article>
  );
}

function VerifactuExecutiveOverview({ runtime }: { runtime: VerifactuRuntimeStatus | null }) {
  const readiness = runtime?.aeatPortalReadiness ?? null;
  const preflight = runtime?.aeatXmlPreflight ?? null;
  const transport = runtime?.aeatSoapTransport ?? null;

  return (
    <section className="verifactu-premium-hero" aria-label="Resumen operativo VERI*FACTU">
      <article className="verifactu-command-card">
        <div>
          <p className="eyebrow">Estado del sistema</p>
          <h2>Preparación VERI*FACTU</h2>
          <p>Lectura ejecutiva del modo operativo, seguridad y disponibilidad técnica.</p>
        </div>

        <div className="verifactu-command-grid">
          <MetricTile
            label="Modo operativo"
            value={runtime ? modeLabel(runtime.verifactuMode) : 'No disponible'}
            badge={runtime?.verifactuEnabled ? 'Activo' : 'Inactivo'}
            tone={runtimeTone(runtime)}
          />
          <MetricTile
            label="Preparación de envío"
            value={preparationLabel(runtime)}
            badge={runtime?.verifactuCanSubmit ? 'Preparado' : 'No activo'}
            tone={runtime?.verifactuCanSubmit ? 'info' : 'warning'}
          />
          <MetricTile
            label="Seguridad de producción"
            value={productionSafetyLabel(runtime)}
            badge={runtime?.verifactuProductionSafe === false ? 'Revisión necesaria' : 'Seguro'}
            tone={runtime?.verifactuProductionSafe === false ? 'blocking' : 'info'}
          />
        </div>
      </article>

      <article className="verifactu-executive-card">
        <p className="eyebrow">Resumen ejecutivo</p>
        <h2>{executiveTitle(runtime)}</h2>
        <p>{executiveDescription(runtime)}</p>

        <dl className="verifactu-executive-list">
          <div>
            <dt>Portal AEAT</dt>
            <dd>{portalReadinessLabel(readiness)}</dd>
          </div>
          <div>
            <dt>Certificado</dt>
            <dd>{certificateLabel(readiness)}</dd>
          </div>
          <div>
            <dt>XML local</dt>
            <dd>{preflight?.enabled ? 'Validación activa' : 'No disponible'}</dd>
          </div>
          <div>
            <dt>Red</dt>
            <dd>{transport?.networkEnabled ? 'Red habilitada' : 'Red desactivada'}</dd>
          </div>
        </dl>

        <p className="verifactu-readonly-note">
          Esta pantalla es sólo de lectura. No existe acción de envío manual a la AEAT desde la interfaz.
        </p>
      </article>
    </section>
  );
}

function VerifactuTechnicalReadinessCard({ runtime }: { runtime: VerifactuRuntimeStatus | null }) {
  const readiness = runtime?.aeatPortalReadiness ?? null;
  const preflight = runtime?.aeatXmlPreflight ?? null;
  const transport = runtime?.aeatSoapTransport ?? null;
  const blockedReasons = readiness?.blockedReasons ?? [];
  const warnings = readiness?.warnings ?? [];

  return (
    <section className="verifactu-technical-card" aria-label="Preparación técnica VERI*FACTU">
      <div className="verifactu-section-heading">
        <div>
          <p className="eyebrow">Preparación técnica</p>
          <h2>Entorno, XML y transporte</h2>
        </div>
        <StatusBadge tone={runtime?.verifactuProductionSafe === false ? 'blocking' : 'info'}>
          {technicalGateLabel(runtime)}
        </StatusBadge>
      </div>

      <div className="verifactu-technical-grid">
        <MetricTile
          label="Portal AEAT"
          value={portalReadinessLabel(readiness)}
          badge={readiness?.ready ? 'Listo' : 'Pendiente'}
          tone={readiness?.ready ? 'info' : 'warning'}
          note={endpointLine(readiness)}
        />
        <MetricTile
          label="Certificado"
          value={certificateLabel(readiness)}
          badge={readiness?.certificateConfigured ? 'Configurado' : 'Pendiente'}
          tone={readiness?.certificateConfigured ? 'info' : 'warning'}
          note={readiness?.certificateFingerprint ? 'Huella configurada' : 'Falta huella del certificado'}
        />
        <MetricTile
          label="Preflight XML"
          value={preflight?.enabled ? 'Validación activa' : 'No disponible'}
          badge={preflight?.blocksInvalidXmlBeforeAdapter ? 'Bloqueante' : 'Informativo'}
          tone={preflight?.enabled ? 'info' : 'warning'}
          note={preflight?.schemaProfile ?? 'Sin perfil local'}
        />
        <MetricTile
          label="Transporte SOAP"
          value={transport?.implemented ? 'Transporte SOAP preparado' : 'No disponible'}
          badge={transport?.networkEnabled ? 'Revisar' : 'Seguro'}
          tone={transport?.networkEnabled ? 'blocking' : 'info'}
          note={transport?.operation ?? 'RegFactuSistemaFacturacion'}
        />
      </div>

      <details className="verifactu-technical-detail">
        <summary>Ver detalle técnico</summary>
        <dl>
          <div>
            <dt>Política de uso</dt>
            <dd>{portalPolicyLabel(readiness)}</dd>
          </div>
          <div>
            <dt>Perfil XML</dt>
            <dd>{preflight?.schemaProfile ?? 'No disponible'}</dd>
          </div>
          <div>
            <dt>Límite por envío</dt>
            <dd>{preflight?.maxRegistroFacturaPerEnvelope ?? 0} registros</dd>
          </div>
          <div>
            <dt>Operación SOAP</dt>
            <dd>{transport?.operation ?? 'RegFactuSistemaFacturacion'}</dd>
          </div>
          <div>
            <dt>Cableado interno</dt>
            <dd>{transport?.wiredIntoSubmissionFlow ? 'cableado al flujo interno' : 'no cableado al flujo de envío'}</dd>
          </div>
          <div>
            <dt>Diagnóstico</dt>
            <dd>
              {blockedReasons.length > 0 ? `Pendiente: ${portalReasonLabel(blockedReasons[0] ?? '')}` : 'Sin bloqueos principales'}
              {warnings.length > 0 ? ` · Aviso: ${portalReasonLabel(warnings[0] ?? '')}` : ''}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function VerifactuFiltersCard({
  status,
  environment,
  total,
  onStatusChange,
  onEnvironmentChange,
}: {
  status: string;
  environment: string;
  total: number;
  onStatusChange: (value: string) => void;
  onEnvironmentChange: (value: string) => void;
}) {
  return (
    <section className="verifactu-filters-card" aria-label="Filtros de registros VERI*FACTU">
      <div>
        <p className="eyebrow">Filtros</p>
        <h2>Registros</h2>
      </div>

      <div className="verifactu-filters-grid">
        <div className="verifactu-filter-field">
          <FieldLabel htmlFor="verifactu-status-filter">Estado</FieldLabel>
          <select id="verifactu-status-filter" value={status} onChange={(event) => onStatusChange(event.target.value)}>
            {statusOptions.map((option) => (
              <option key={option.value || 'all-statuses'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="verifactu-filter-field">
          <FieldLabel htmlFor="verifactu-environment-filter">Entorno</FieldLabel>
          <select id="verifactu-environment-filter" value={environment} onChange={(event) => onEnvironmentChange(event.target.value)}>
            {environmentOptions.map((option) => (
              <option key={option.value || 'all-environments'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <span className="verifactu-count">{total} registro{total === 1 ? '' : 's'}</span>
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
        <p>Las facturas emitidas o rectificadas aparecerán aquí con su estado de preparación, entorno y trazabilidad de cadena.</p>
      </div>
    </section>
  );
}

function VerifactuAttemptsPanel({
  attempts,
  loading,
  error,
}: {
  attempts: VerifactuSubmissionAttempt[] | undefined;
  loading: boolean;
  error: string | undefined;
}) {
  if (loading) {
    return <p className="verifactu-attempts-muted">Cargando historial de intentos…</p>;
  }

  if (error) {
    return <p className="import-error" role="status">{error}</p>;
  }

  if (!attempts || attempts.length === 0) {
    return <p className="verifactu-attempts-muted">Este registro todavía no tiene intentos auditables.</p>;
  }

  return (
    <div className="verifactu-attempts-card">
      <div className="verifactu-attempts-heading">
        <p className="eyebrow">Historial auditable</p>
        <h3>Historial de intentos</h3>
      </div>

      <ol className="verifactu-attempts-list">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="verifactu-attempt-item">
            <div className="verifactu-attempt-header">
              <strong>Intento {attempt.attemptNumber}</strong>
              <StatusBadge tone={statusTone(attempt.status)}>{statusLabel(attempt.status)}</StatusBadge>
            </div>
            <dl className="verifactu-attempt-meta">
              <div>
                <dt>Fecha</dt>
                <dd>{formatDate(attempt.attemptedAt)}</dd>
              </div>
              <div>
                <dt>Referencia</dt>
                <dd>{responseText(attempt.responseRedacted, 'reference')}</dd>
              </div>
              <div>
                <dt>Enviado</dt>
                <dd>{formatDate(responseText(attempt.responseRedacted, 'submittedAt'))}</dd>
              </div>
            </dl>
            <p className="verifactu-attempt-message">{responseText(attempt.responseRedacted, 'message')}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function VerifactuResultsCard({
  items,
  total,
  loading,
  expandedId,
  attemptsBySubmission,
  attemptsLoading,
  attemptsError,
  onToggleAttempts,
}: {
  items: VerifactuSubmission[];
  total: number;
  loading: boolean;
  expandedId: string | null;
  attemptsBySubmission: Record<string, VerifactuSubmissionAttempt[]>;
  attemptsLoading: Record<string, boolean>;
  attemptsError: Record<string, string>;
  onToggleAttempts: (item: VerifactuSubmission) => void;
}) {
  if (loading) {
    return (
      <section className="verifactu-results-card" role="status">
        <p>Cargando registros VERI*FACTU…</p>
      </section>
    );
  }

  if (items.length === 0) return <VerifactuEmptyState />;

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
              <th scope="col">Auditoría</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Fragment key={item.id}>
                <tr>
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
                  <td>
                    <button
                      type="button"
                      className="verifactu-link-button"
                      aria-expanded={expandedId === item.id}
                      aria-label={`${expandedId === item.id ? 'Ocultar' : 'Ver'} historial de ${item.fiscalDocumentNumber}`}
                      onClick={() => onToggleAttempts(item)}
                    >
                      {expandedId === item.id ? 'Ocultar historial' : 'Ver historial'}
                    </button>
                  </td>
                </tr>
                {expandedId === item.id ? (
                  <tr className="verifactu-attempts-row">
                    <td colSpan={8}>
                      <VerifactuAttemptsPanel
                        attempts={attemptsBySubmission[item.id]}
                        loading={Boolean(attemptsLoading[item.id])}
                        error={attemptsError[item.id]}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attemptsBySubmission, setAttemptsBySubmission] = useState<Record<string, VerifactuSubmissionAttempt[]>>({});
  const [attemptsLoading, setAttemptsLoading] = useState<Record<string, boolean>>({});
  const [attemptsError, setAttemptsError] = useState<Record<string, string>>({});

  const params = useMemo(() => {
    const query = new URLSearchParams({
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    });

    if (status) query.set('status', status);
    if (environment) query.set('environment', environment);

    return query;
  }, [environment, pagination.page, pagination.pageSize, status]);

  async function loadAttempts(submissionId: string) {
    setAttemptsLoading((current) => ({ ...current, [submissionId]: true }));
    setAttemptsError((current) => ({ ...current, [submissionId]: '' }));

    try {
      const response = await fetch(`/api/v1/verifactu/submissions/${submissionId}/attempts`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('No se pudo cargar el historial de intentos VERI*FACTU');
      }

      const data = await response.json() as VerifactuSubmissionAttemptsResponse;

      setAttemptsBySubmission((current) => ({
        ...current,
        [submissionId]: data.items,
      }));
    } catch (reason) {
      setAttemptsError((current) => ({
        ...current,
        [submissionId]: reason instanceof Error ? reason.message : 'No se pudo cargar el historial de intentos VERI*FACTU',
      }));
    } finally {
      setAttemptsLoading((current) => ({ ...current, [submissionId]: false }));
    }
  }

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
      <VerifactuExecutiveOverview runtime={runtime} />
      <VerifactuTechnicalReadinessCard runtime={runtime} />

      <VerifactuFiltersCard
        status={status}
        environment={environment}
        total={pagination.total}
        onStatusChange={(value) => {
          setStatus(value);
          setExpandedId(null);
          setPagination((current) => ({ ...current, page: 1 }));
        }}
        onEnvironmentChange={(value) => {
          setEnvironment(value);
          setExpandedId(null);
          setPagination((current) => ({ ...current, page: 1 }));
        }}
      />

      {error ? <p className="import-error" role="status">{error}</p> : null}

      <VerifactuResultsCard
        items={items}
        total={pagination.total}
        loading={loading}
        expandedId={expandedId}
        attemptsBySubmission={attemptsBySubmission}
        attemptsLoading={attemptsLoading}
        attemptsError={attemptsError}
        onToggleAttempts={(item) => {
          const nextExpanded = expandedId === item.id ? null : item.id;
          setExpandedId(nextExpanded);

          if (nextExpanded && !attemptsBySubmission[item.id]) {
            void loadAttempts(item.id);
          }
        }}
      />
    </div>
  );
}
