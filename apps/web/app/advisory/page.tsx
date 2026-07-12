'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FieldLabel, PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';

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
      <section>
        <FieldLabel htmlFor="advisor-period" required>
          Periodo
        </FieldLabel>
        <input
          id="advisor-period"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          placeholder="2026-06"
        />
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
        <nav aria-label="Consultas de asesoría">
          <ul>
            <li>
              <Link href="/sales/shopify">Ventas</Link>
            </li>
            <li>
              <Link href="/sif-events">Incidencias</Link>
            </li>
            <li>
              <Link href="/invoicing">Facturas</Link>
            </li>
            <li>
              <Link href="/verifactu">VERI*FACTU</Link>
            </li>
            <li>
              <Link href="/tax-periods">Periodos y exports</Link>
            </li>
          </ul>
        </nav>
        {period ? (
          <a
            href={`/api/v1/periods/${encodeURIComponent(period)}/vat-dossier/archive`}
          >
            Descargar dossier verificado
          </a>
        ) : null}
        <p>
          Este perfil no puede importar, emitir, rectificar, cerrar, resolver
          alertas ni cambiar configuración.
        </p>
      </section>
    </AppShell>
  );
}
