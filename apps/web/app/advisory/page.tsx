'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FieldLabel, PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';

const quickLinks = [
  { href: '/sales/shopify', label: 'Ventas', description: 'Pedidos y transacciones de Shopify.' },
  { href: '/sif-events', label: 'Incidencias', description: 'Registro encadenado de eventos SIF.' },
  { href: '/invoicing', label: 'Facturas', description: 'Documentos emitidos y su estado.' },
  { href: '/verifactu', label: 'VERI*FACTU', description: 'Cadena de envíos verificable.' },
  { href: '/tax-periods', label: 'Periodos y exports', description: 'Cierre de periodo y expedientes de IVA.' },
] as const;

export default function AdvisoryPage() {
  const [period, setPeriod] = useState('');

  return (
    <AppShell>
      <PageHeader
        eyebrow="ASESORÍA · SOLO LECTURA"
        title="Espacio de asesoría"
        description="Consulta y descarga evidencia fiscal sin permisos de mutación."
        backHref="/"
      />
      <section className="evidence-panel advisory-panel">
        <div className="field advisory-period-field">
          <FieldLabel htmlFor="advisor-period" required>
            Periodo
          </FieldLabel>
          <input
            id="advisor-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            placeholder="2026-06"
            autoComplete="off"
          />
        </div>

        <div className="metrics">
          <article>
            <h2>Portada del dossier</h2>
            <dl>
              <div>
                <dt>Entidad</dt>
                <dd>Anclora Fiscal</dd>
              </div>
              <div>
                <dt>NIF</dt>
                <dd>Enmascarado</dd>
              </div>
              <div>
                <dt>Periodo</dt>
                <dd>{period || '—'}</dd>
              </div>
              <div>
                <dt>IVA, ventas, gastos y documentos</dt>
                <dd>Disponibles al generar el dossier</dd>
              </div>
            </dl>
          </article>
        </div>

        <nav aria-label="Consultas de asesoría" className="advisory-quick-links">
          <span className="section-index">Consultas disponibles</span>
          <ul className="summary-grid advisory-quick-links-grid">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <article>
                  <Link href={link.href}>{link.label}</Link>
                  <span>{link.description}</span>
                </article>
              </li>
            ))}
          </ul>
        </nav>

        {period ? (
          <a
            className="btn btn-primary advisory-download"
            href={`/api/v1/periods/${encodeURIComponent(period)}/vat-dossier/archive`}
          >
            Descargar dossier verificado
          </a>
        ) : null}

        <p className="advisory-disclaimer">
          Este perfil no puede importar, emitir, rectificar, cerrar, resolver
          alertas ni cambiar configuración.
        </p>
      </section>
    </AppShell>
  );
}
