'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EmptyState, MetricCard, PageHeader, StatusBadge } from '@anclora/ui';
import { AppShell } from './components/app-shell';
import { formatSpanishPeriod } from './lib/spanish-months';

interface DashboardSummary {
  openIssuesCount: number;
  importsThisMonthCount: number;
  reconciliationStatus: { matched: number; unmatched: number; total: number };
  documentsIssuedCount: number;
  royalties: { statementsCount: number; totalThisPeriod: string; period: string };
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/v1/dashboard/summary', { credentials: 'include' });
        if (!response.ok) throw new Error('No se pudo obtener el resumen del panel');
        const data = await response.json() as DashboardSummary;
        if (!cancelled) setSummary(data);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudo obtener el resumen del panel');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const isEmpty = summary
    ? summary.importsThisMonthCount === 0 && summary.reconciliationStatus.total === 0 && summary.royalties.statementsCount === 0
    : false;
  const reconciliationPercentage = summary && summary.reconciliationStatus.total > 0
    ? Math.round((summary.reconciliationStatus.matched / summary.reconciliationStatus.total) * 100)
    : undefined;

  return <AppShell pendingCounts={summary ? { openIssuesCount: summary.openIssuesCount, reconciliationTotal: summary.reconciliationStatus.total } : undefined}>
    <PageHeader
      eyebrow="Centro de control"
      title="Centro de control"
      actions={<Link className="btn btn-primary" href="/imports">Importar evidencias <span aria-hidden="true">↗</span></Link>}
    />
    {error ? <p className="import-error">{error}</p> : null}
    {loading ? <p aria-live="polite">Cargando resumen…</p> : null}

    {!loading && !error && isEmpty ? <section className="attention" aria-labelledby="attention-title">
      <div><span className="section-index">EMPEZAR</span><h2 id="attention-title">Todavía no hay importaciones</h2><p>Importa tu primer archivo de evidencias (pedidos, pagos o regalías) para empezar a ver datos reales aquí.</p></div>
      <div className="attention-list">
        <article><StatusBadge tone="info">Primeros pasos</StatusBadge><div><strong>Sin datos todavía</strong><p>El panel se completará automáticamente en cuanto importes tu primera evidencia.</p></div><Link href="/imports">Importar →</Link></article>
      </div>
    </section> : null}

    {!loading && !error && summary ? <>
      <section className="metrics" aria-label="Pendientes de revisar">
        <MetricCard label="Pendientes de revisar" value={String(summary.openIssuesCount)} detail="Incidencias abiertas" />
        <MetricCard label="Importaciones del mes" value={String(summary.importsThisMonthCount)} detail="Este mes" />
        <MetricCard label="Documentos emitidos" value={String(summary.documentsIssuedCount)} detail="Serie AF-2026" />
      </section>

      <EmptyState
        title="Ventas facturables"
        description="Todavía no hay un contador agregado de ventas pendientes de facturar en el centro de control. Consulta el panel de facturación para ver las operaciones reales pendientes."
        action={<Link href="/invoicing">Ir a facturación →</Link>}
      />

      <section className="evidence-panel" aria-label="Liquidaciones KDP">
        <div><span className="section-index">REGALÍAS</span><h2>Liquidaciones KDP</h2></div>
        <p className="period-label">Periodo: {formatSpanishPeriod(summary.royalties.period)}</p>
        <dl>
          <div><dt>Estados importados</dt><dd>{summary.royalties.statementsCount}</dd></div>
          <div><dt>Total del periodo</dt><dd>{summary.royalties.totalThisPeriod} EUR</dd></div>
        </dl>
      </section>

      <EmptyState
        title="Estado del trimestre"
        description="Todavía no hay un indicador agregado del estado del trimestre fiscal en el centro de control. Consulta periodos fiscales para el detalle real del cierre."
        action={<Link href="/tax-periods">Ir a periodos fiscales →</Link>}
      />

      <EmptyState
        title="Incidencia bloqueante"
        description="No hay ninguna incidencia bloqueante registrada todavía en esta vista agregada."
      />

      {summary.reconciliationStatus.total > 0 ? <section className="metrics" aria-label="Conciliación">
        <MetricCard
          label="Conciliación"
          value={reconciliationPercentage !== undefined ? `${reconciliationPercentage} %` : '—'}
          detail={`${summary.reconciliationStatus.total} operaciones`}
        />
      </section> : null}
    </> : null}
  </AppShell>;
}
