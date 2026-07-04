'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MetricCard, StatusBadge } from '@anclora/ui';
import medal from '../../../packages/ui/assets/brand/anclora-fiscal-medalla-oro-transparente.png';
import tenantMedal from '../../../packages/ui/assets/brand/anclora-insights-medalla-oro-transparente.png';
import { LogoutButton } from './logout-button';

const nav = ['Centro de control', 'Importaciones', 'Operaciones', 'Conciliación', 'Facturación', 'VERI*FACTU', 'Motor fiscal', 'Expedientes IVA', 'Configuración'];
const routes = ['/', '/imports', '/operations', '/reconciliation', '/invoicing', '/verifactu', '/tax-engine', '/vat-dossier', '/settings'];

interface DashboardSummary {
  openIssuesCount: number;
  importsThisMonthCount: number;
  reconciliationStatus: { matched: number; unmatched: number; total: number };
  documentsIssuedCount: number;
  royalties: { statementsCount: number; totalThisPeriod: string };
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001'}/api/v1/dashboard/summary`, { credentials: 'include' });
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

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup" aria-label="Anclora Fiscal">
        <span className="brand-medal"><Image src={medal} alt="" priority /></span>
        <span>Anclora <em>Fiscal</em></span>
      </div>
      <nav aria-label="Navegación principal">{nav.map((item, index) => <a className={index === 0 ? 'active' : ''} href={routes[index]} key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}</a>)}</nav>
      <div className="tenant"><span className="tenant-medal"><Image src={tenantMedal} alt="" /></span><div><strong>Anclora Insights</strong><small>Entidad activa · EUR</small></div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><span className="eyebrow">Centro de control</span><h1>Centro de control</h1></div><div className="topbar-actions"><LogoutButton /><Link href="/imports"><button type="button">Importar evidencias</button></Link></div></header>
      {error ? <p className="import-error">{error}</p> : null}
      {loading ? <p aria-live="polite">Cargando resumen…</p> : null}
      {!loading && !error && isEmpty ? <section className="attention" aria-labelledby="attention-title">
        <div><span className="section-index">EMPEZAR</span><h2 id="attention-title">Todavía no hay importaciones</h2><p>Importa tu primer archivo de evidencias (pedidos, pagos o regalías) para empezar a ver datos reales aquí.</p></div>
        <div className="attention-list">
          <article><StatusBadge tone="info">Primeros pasos</StatusBadge><div><strong>Sin datos todavía</strong><p>El panel se completará automáticamente en cuanto importes tu primera evidencia.</p></div><Link href="/imports">Importar →</Link></article>
        </div>
      </section> : null}
      {!loading && !error && summary ? <section className="metrics" aria-label="Resumen operativo">
        <MetricCard label="Pendientes de revisión" value={String(summary.openIssuesCount).padStart(2, '0')} detail="Incidencias abiertas" />
        <MetricCard label="Importaciones del mes" value={String(summary.importsThisMonthCount).padStart(2, '0')} detail="Este mes" />
        <MetricCard label="Conciliación" value={reconciliationPercentage !== undefined ? `${reconciliationPercentage} %` : 'N/D'} detail={`${summary.reconciliationStatus.total} operaciones`} />
        <MetricCard label="Documentos emitidos" value={String(summary.documentsIssuedCount).padStart(2, '0')} detail="Serie AF-2026" />
      </section> : null}
      {!loading && !error && summary ? <section className="evidence-panel" aria-label="Regalías (KDP)">
        <div><span className="section-index">REGALÍAS</span><h2>Regalías (KDP)</h2></div>
        <dl>
          <div><dt>Estados importados</dt><dd>{summary.royalties.statementsCount}</dd></div>
          <div><dt>Total del periodo</dt><dd>{summary.royalties.totalThisPeriod} EUR</dd></div>
        </dl>
      </section> : null}
    </section>
  </main>;
}
