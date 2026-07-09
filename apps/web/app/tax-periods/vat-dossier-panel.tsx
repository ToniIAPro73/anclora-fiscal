'use client';

import { useState } from 'react';
import { FieldLabel, StatusBadge } from '@anclora/ui';

interface VatDossier {
  id: string;
  period: string;
  status: string;
  manifest: Record<string, string>;
}

const statusLabels: Record<string, string> = { CLOSED: 'Cerrado' };

const fileDescriptions: Record<string, string> = {
  'facturas.csv': 'Listado de facturas del periodo (CSV)',
  'facturas.xlsx': 'Listado de facturas del periodo (Excel)',
  'resumen-iva.pdf': 'Resumen ejecutivo de IVA (PDF)',
  'estado-verifactu.json': 'Detalle verificable de registros VERI*FACTU (JSON)',
};

export function VatDossierPanel() {
  const [period, setPeriod] = useState('');
  const [dossier, setDossier] = useState<VatDossier>();
  const [notClosed, setNotClosed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function resetOutcome() {
    setDossier(undefined);
    setNotClosed(false);
    setNotFound(false);
    setError('');
  }

  async function fetchDossier(currentPeriod: string) {
    setBusy(true); resetOutcome();
    try {
      const response = await fetch(`/api/v1/periods/${encodeURIComponent(currentPeriod)}/vat-dossier`, { credentials: 'include' });
      if (response.status === 404) { setNotFound(true); return; }
      if (!response.ok) throw new Error('No se pudo consultar el expediente de IVA');
      setDossier(await response.json() as VatDossier);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo consultar el expediente de IVA');
    } finally {
      setBusy(false);
    }
  }

  async function generateDossier(currentPeriod: string) {
    setBusy(true); resetOutcome();
    try {
      const response = await fetch(`/api/v1/periods/${encodeURIComponent(currentPeriod)}/vat-dossier`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.status === 409) {
        const body = await response.json() as { code?: string };
        if (body.code === 'PERIOD_NOT_CLOSED') { setNotClosed(true); return; }
      }
      if (!response.ok) throw new Error('No se pudo generar el expediente de IVA');
      setDossier(await response.json() as VatDossier);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo generar el expediente de IVA');
    } finally {
      setBusy(false);
    }
  }

  return <section className="vat-dossier">
    <span className="section-index">Consultar expediente</span>
    <form
      onSubmit={(event) => { event.preventDefault(); if (period.trim()) void fetchDossier(period.trim()); }}
      className="drop-panel"
    >
      <FieldLabel htmlFor="vat-period" required>Periodo</FieldLabel>
      <input id="vat-period" name="period" placeholder="2026-T3" value={period} onChange={(event) => setPeriod(event.target.value)} required />
      <div className="dossier-actions">
        <button disabled={busy || !period.trim()} type="submit">{busy ? 'Consultando…' : 'Consultar expediente'}</button>
        <button disabled={busy || !period.trim()} type="button" onClick={() => void generateDossier(period.trim())}>{busy ? 'Generando…' : 'Generar expediente'}</button>
      </div>
    </form>
    {error ? <p className="import-error" role="status">{error}</p> : null}
    {notClosed ? <p className="import-error" role="status">El período no está cerrado todavía; no se puede generar un expediente de IVA hasta que exista un cierre de periodo.</p> : null}
    {notFound ? <p role="status">No hay un periodo cerrado ni un expediente de IVA para este periodo todavía.</p> : null}
    {dossier ? <>
      <StatusBadge tone="info">{statusLabels[dossier.status] ?? dossier.status}</StatusBadge>
      <h2>Periodo {dossier.period}</h2>
      <table>
        <thead><tr><th scope="col">Fichero</th><th scope="col">Descripción</th></tr></thead>
        <tbody>{Object.entries(dossier.manifest).map(([file]) => <tr key={file}><td>{file}</td><td>{fileDescriptions[file] ?? 'Fichero del expediente'}</td></tr>)}</tbody>
      </table>
    </> : null}
  </section>;
}
