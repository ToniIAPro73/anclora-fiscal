'use client';

import { useState } from 'react';
import { Button, FieldLabel, StatusBadge } from '@anclora/ui';

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
  const [downloading, setDownloading] = useState(false);

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

  async function downloadDossier(currentPeriod: string) {
    setDownloading(true); setError('');
    try {
      const response = await fetch(`/api/v1/periods/${encodeURIComponent(currentPeriod)}/vat-dossier/archive`, { credentials: 'include' });
      if (response.status === 404) throw new Error('No existe un expediente de IVA para este periodo');
      if (response.status === 409) throw new Error('No se descargó el expediente porque falló la verificación de integridad');
      if (!response.ok) throw new Error('No se pudo descargar el expediente de IVA');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `expediente-iva-${currentPeriod}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo descargar el expediente de IVA');
    } finally {
      setDownloading(false);
    }
  }

  return <section className="vat-dossier">
    <span className="section-index">Consultar expediente</span>
    <h2>Expediente de IVA</h2>
    <form
      onSubmit={(event) => { event.preventDefault(); if (period.trim()) void fetchDossier(period.trim()); }}
      className="inline-lookup-form"
    >
      <div className="field">
        <FieldLabel htmlFor="vat-period" required>Periodo</FieldLabel>
        <input id="vat-period" name="period" placeholder="2026-T3" value={period} onChange={(event) => setPeriod(event.target.value)} required />
      </div>
      <div className="dossier-actions">
        <Button disabled={busy || !period.trim()} type="submit">{busy ? 'Consultando…' : 'Consultar expediente'}</Button>
        <Button variant="secondary" disabled={busy || !period.trim()} type="button" onClick={() => void generateDossier(period.trim())}>{busy ? 'Generando…' : 'Generar expediente'}</Button>
      </div>
    </form>
    {error ? <p className="import-error" role="status">{error}</p> : null}
    {notClosed ? <p className="import-error" role="status">El período no está cerrado todavía; no se puede generar un expediente de IVA hasta que exista un cierre de periodo.</p> : null}
    {notFound ? <p role="status" className="workbench-notice">No hay un periodo cerrado ni un expediente de IVA para este periodo todavía.</p> : null}
    {dossier ? <div className="vat-dossier-result">
      <StatusBadge tone="info">{statusLabels[dossier.status] ?? dossier.status}</StatusBadge>
      <h3>Periodo {dossier.period}</h3>
      <Button type="button" disabled={downloading} onClick={() => void downloadDossier(period.trim())}>{downloading ? 'Descargando…' : 'Descargar ZIP verificado'}</Button>
      <div className="reconciliation-table-panel">
        <table>
          <thead><tr><th scope="col">Fichero</th><th scope="col">Descripción</th></tr></thead>
          <tbody>{Object.entries(dossier.manifest).map(([file]) => <tr key={file}><td>{file}</td><td>{fileDescriptions[file] ?? 'Fichero del expediente'}</td></tr>)}</tbody>
        </table>
      </div>
    </div> : null}
  </section>;
}
