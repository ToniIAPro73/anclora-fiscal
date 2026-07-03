'use client';

import { useState } from 'react';
import { FieldLabel, StatusBadge } from '@anclora/ui';

interface Preview { jobId: string; connector: string; status: string; summary: { records: number; issues: number; orderIds: string[] }; issues: Array<{ code: string; severity: string; message: string }> }

export function ImportUploader() {
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true); setError(''); setPreview(undefined);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001'}/api/v1/imports/preview`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('El archivo no supera la validación estructural');
      setPreview(await response.json() as Preview);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo procesar el archivo'); }
    finally { setBusy(false); }
  }

  return <section className="import-workbench">
    <form action={submit} className="drop-panel">
      <span className="section-index">NUEVA IMPORTACIÓN</span>
      <FieldLabel htmlFor="evidence-files" required>Archivos de evidencia</FieldLabel>
      <input id="evidence-files" name="file" type="file" accept=".csv,.pdf,text/csv,application/pdf" required />
      <p>Shopify CSV o PDF · máximo 15 MB · el original se conserva con SHA-256.</p>
      <button disabled={busy} type="submit">{busy ? 'Analizando…' : 'Generar vista previa'}</button>
    </form>
    <section className="preview-panel" aria-live="polite">
      <span className="section-index">RESULTADO</span>
      {error ? <p className="import-error">{error}</p> : null}
      {!preview && !error ? <div className="empty-preview"><strong>Sin archivo analizado</strong><p>La importación no crea operaciones hasta que confirmes la vista previa.</p></div> : null}
      {preview ? <><div className="preview-heading"><div><StatusBadge tone={preview.summary.issues ? 'warning' : 'info'}>{preview.status}</StatusBadge><h2>{preview.connector}</h2></div><strong>{preview.summary.records}<small> registros</small></strong></div><dl><div><dt>Pedidos detectados</dt><dd>{preview.summary.orderIds.join(', ')}</dd></div><div><dt>Incidencias</dt><dd>{preview.summary.issues}</dd></div></dl><ul>{preview.issues.map((issue) => <li key={`${issue.code}-${issue.message}`}><strong>{issue.code}</strong><span>{issue.message}</span></li>)}</ul></> : null}
    </section>
  </section>;
}
