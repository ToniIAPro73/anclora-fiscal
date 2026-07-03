import Image from 'next/image';
import { MetricCard, StatusBadge } from '@anclora/ui';
import medal from '../../../packages/ui/assets/brand/anclora-fiscal-medalla-oro-transparente.png';

const nav = ['Centro de control', 'Importaciones', 'Operaciones', 'Conciliación', 'Facturación', 'VERI*FACTU', 'Motor fiscal', 'Expedientes IVA', 'Configuración'];
const routes = ['/', '/imports', '/operations', '/reconciliation', '/invoicing', '/verifactu', '/tax-engine', '/vat-dossier', '/settings'];

export default function Dashboard() {
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup" aria-label="Anclora Fiscal">
        <span className="brand-medal"><Image src={medal} alt="" priority /></span>
        <span>Anclora <em>Fiscal</em></span>
      </div>
      <nav aria-label="Navegación principal">{nav.map((item, index) => <a className={index === 0 ? 'active' : ''} href={routes[index]} key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}</a>)}</nav>
      <div className="tenant"><span className="tenant-medal"><Image src={medal} alt="" /></span><div><strong>Anclora Insights</strong><small>Entidad activa · EUR</small></div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><span className="eyebrow">Periodo abierto · T3 2026</span><h1>Centro de control</h1></div><button type="button">Importar evidencias</button></header>
      <section className="attention" aria-labelledby="attention-title">
        <div><span className="section-index">01 / ATENCIÓN</span><h2 id="attention-title">Lo que requiere una decisión</h2><p>Cada alerta conserva evidencia, cálculo y responsable.</p></div>
        <div className="attention-list">
          <article><StatusBadge tone="blocking">Bloqueante</StatusBadge><div><strong>1 operación sin país fiscal</strong><p>La regla fiscal no puede determinarse sin evidencia suficiente.</p></div><span>Revisar →</span></article>
          <article><StatusBadge tone="high">Alta</StatusBadge><div><strong>Refund AI-1001 pendiente</strong><p>Neto cero; requiere evaluar documento rectificativo.</p></div><span>Revisar →</span></article>
        </div>
      </section>
      <section className="metrics" aria-label="Resumen operativo">
        <MetricCard label="Pendientes de revisión" value="07" detail="2 bloqueantes" />
        <MetricCard label="Importaciones del mes" value="03" detail="100 % trazables" />
        <MetricCard label="Conciliación" value="82 %" detail="6 operaciones abiertas" />
        <MetricCard label="Documentos emitidos" value="12" detail="Serie AF-2026" />
      </section>
      <section className="evidence-panel">
        <div><span className="section-index">02 / TRAZABILIDAD</span><h2>Hilo de evidencia reciente</h2></div>
        <ol className="evidence-thread">
          <li><time>08:12</time><div><strong>Refund registrado</strong><p>AI-1001 · Shopify Payments · −6,99 EUR</p></div><StatusBadge tone="warning">Revisión</StatusBadge></li>
          <li><time>07:33</time><div><strong>Cobro enlazado al pedido</strong><p>Coincidencia exacta por pedido y checkout · confianza 100 %</p></div><StatusBadge tone="info">Trazado</StatusBadge></li>
          <li><time>01 JUL</time><div><strong>Pedido comercial importado</strong><p>PDF sin importes fiscales · evidencia original conservada</p></div><StatusBadge tone="high">Incidencia</StatusBadge></li>
        </ol>
      </section>
    </section>
  </main>;
}
