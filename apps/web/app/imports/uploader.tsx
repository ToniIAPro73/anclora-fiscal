'use client';

import { useState } from 'react';
import { FieldLabel, StatusBadge } from '@anclora/ui';

interface RoyaltyLine { isbnOrAsin: string; title?: string; classification: string; unitsNet?: number; amount: number; currency: string }
interface Preview {
  jobId: string;
  connector: string;
  status: string;
  summary: { records: number; issues: number; orderIds: string[] };
  issues: Array<{ code: string; severity: string; message: string; sheet?: string }>;
  royalty?: { lines: RoyaltyLine[] };
}

const statusLabels: Record<string, string> = { PREVIEW_READY: 'Vista previa lista' };
const royaltyClassificationLabels: Record<string, string> = {
  ebook: 'eBook',
  impreso: 'Impreso',
  coste_produccion: 'Coste de producción',
  regalia: 'Regalía',
  venta_marketplace: 'Venta marketplace',
  reembolso: 'Reembolso',
  ajuste: 'Ajuste',
  liquidacion: 'Liquidación',
  kenp_lectura: 'Lectura KENP',
};

export function ImportUploader() {
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true); setError(''); setPreview(undefined);
    try {
      const response = await fetch('/api/v1/imports/preview', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!response.ok) throw new Error('El archivo no supera la validación estructural');
      setPreview(await response.json() as Preview);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo procesar el archivo'); }
    finally { setBusy(false); }
  }

  return <section className="import-workbench">
    <form action={submit} className="drop-panel">
      <span className="section-index">NUEVA IMPORTACIÓN</span>
      <FieldLabel htmlFor="evidence-files" required>Archivos de evidencia</FieldLabel>
      <input id="evidence-files" name="file" type="file" accept=".csv,.pdf,.xlsx,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
      <p>Shopify CSV/PDF o Amazon KDP XLSX · máximo 15 MB · el original validado se conserva con SHA-256.</p>
      <button disabled={busy} type="submit">{busy ? 'Analizando…' : 'Generar vista previa'}</button>
    </form>
    <section className="preview-panel" aria-live="polite">
      <span className="section-index">RESULTADO</span>
      {error ? <p className="import-error">{error}</p> : null}
      {!preview && !error ? <div className="empty-preview"><strong>Sin archivo analizado</strong><p>Al generar la vista previa, el archivo ya queda guardado como evidencia. Las operaciones se crean automáticamente en cuanto exista tanto el pedido como su pago correspondiente importados.</p></div> : null}
      {preview ? <ImportPreviewResult preview={preview} /> : null}
    </section>
  </section>;
}

function ImportPreviewResult({ preview }: { preview: Preview }) {
  return <>
    <div className="preview-heading">
      <div><StatusBadge tone={preview.summary.issues ? 'warning' : 'info'}>{statusLabels[preview.status] ?? preview.status}</StatusBadge><h2>{preview.connector}</h2></div>
      <strong>{preview.summary.records}<small> registros</small></strong>
    </div>
    {preview.connector === 'kdp-xlsx' ? <KdpPreviewTable preview={preview} /> : <OrdersPreviewTable preview={preview} />}
  </>;
}

function OrdersPreviewTable({ preview }: { preview: Preview }) {
  const issuesByOrder = new Map<string, string[]>();
  const generalIssues: string[] = [];
  for (const issue of preview.issues) {
    const order = preview.summary.orderIds.find((orderId) => issue.message.startsWith(`${orderId}: `));
    if (order) {
      const description = issue.message.slice(order.length + 2);
      issuesByOrder.set(order, [...(issuesByOrder.get(order) ?? []), description]);
    } else {
      generalIssues.push(issue.message);
    }
  }

  return <>
    <table>
      <thead><tr><th scope="col">Pedido</th><th scope="col">Incidencias</th></tr></thead>
      <tbody>
        {preview.summary.orderIds.map((orderId) => <tr key={orderId}>
          <td>{orderId}</td>
          <td>{issuesByOrder.has(orderId) ? issuesByOrder.get(orderId)!.join('; ') : '—'}</td>
        </tr>)}
      </tbody>
    </table>
    {generalIssues.length > 0 ? <GeneralIssuesList messages={generalIssues} /> : null}
  </>;
}

function KdpPreviewTable({ preview }: { preview: Preview }) {
  const lines = preview.royalty?.lines ?? [];
  // KDP issues reference a spreadsheet sheet/row, not an ISBN/ASIN, so they
  // can't be attributed to a specific royalty line the way Shopify's
  // order-prefixed issue messages can — shown as a general list instead,
  // labeled by sheet for context.
  const generalIssues = preview.issues.map((issue) => issue.sheet ? `[${issue.sheet}] ${issue.message}` : issue.message);

  return <>
    <table>
      <thead><tr><th scope="col">Título</th><th scope="col">ISBN/ASIN</th><th scope="col">Formato</th><th scope="col">Unidades</th><th scope="col">Importe</th></tr></thead>
      <tbody>
        {lines.map((line, index) => <tr key={`${line.isbnOrAsin}-${index}`}>
          <td>{line.title ?? '—'}</td>
          <td>{line.isbnOrAsin}</td>
          <td>{royaltyClassificationLabels[line.classification] ?? line.classification}</td>
          <td>{line.unitsNet ?? '—'}</td>
          <td>{line.amount.toFixed(2)} {line.currency}</td>
        </tr>)}
      </tbody>
    </table>
    {generalIssues.length > 0 ? <GeneralIssuesList messages={generalIssues} /> : null}
  </>;
}

function GeneralIssuesList({ messages }: { messages: string[] }) {
  return <div className="general-issues">
    <span className="section-index">Otras incidencias</span>
    <ul>{messages.map((message) => <li key={message}>{message}</li>)}</ul>
  </div>;
}
