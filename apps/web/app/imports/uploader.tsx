'use client';

import { useState } from 'react';
import { FieldLabel, StatusBadge } from '@anclora/ui';
import { formatSpanishPeriodRange } from '../lib/spanish-months';

interface RoyaltyLine {
  isbnOrAsin: string;
  title?: string;
  classification: string;
  unitsNet?: number;
  amount: number;
  currency: string;
  /** Real book format (ebook/impreso), independent of `classification` — survives the 'reembolso' override. See packages/core/src/royalty.ts. */
  format?: string;
  /** Full ISO date (YYYY-MM-DD) for the transaction. */
  date?: string;
}

interface CommercialOrderPreview {
  externalOrderId: string;
  commercialDate?: string;
  customerName?: string;
  totalAmount?: string;
  taxAmount?: string;
}

interface Preview {
  jobId: string;
  connector: string;
  status: string;
  summary: {
    records: number;
    issues: number;
    orderIds: string[];
    alreadyImportedCount?: number;
    allAlreadyImported?: boolean;
  };
  issues: Array<{ code: string; severity: string; message: string; sheet?: string }>;
  royalty?: { statement: { periods: string[] }; lines: RoyaltyLine[] };
  commercialOrders?: CommercialOrderPreview[];
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

function DedupNotice({ summary }: { summary: Preview['summary'] }) {
  if (summary.allAlreadyImported) {
    return <p className="dedup-notice">Todos los registros de este archivo ya estaban importados.</p>;
  }
  if (summary.alreadyImportedCount && summary.alreadyImportedCount > 0) {
    return <p className="dedup-notice">{summary.alreadyImportedCount} registros omitidos por ya estar importados.</p>;
  }
  return null;
}

function ImportPreviewResult({ preview }: { preview: Preview }) {
  return <>
    <div className="preview-heading">
      <div><StatusBadge tone={preview.summary.issues ? 'warning' : 'info'}>{statusLabels[preview.status] ?? preview.status}</StatusBadge><h2>{preview.connector}</h2></div>
      <strong>{preview.summary.records}<small> registros</small></strong>
    </div>
    <DedupNotice summary={preview.summary} />
    {preview.summary.allAlreadyImported ? null : (preview.connector === 'kdp-xlsx' ? <KdpPreviewTable preview={preview} /> : <OrdersPreviewTable preview={preview} />)}
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

  // Prefer the richer commercialOrders array; fall back to bare order-id
  // strings for an older cached preview shape that predates Task 4.10.
  const rows: CommercialOrderPreview[] = preview.commercialOrders
    ?? preview.summary.orderIds.map((externalOrderId) => ({ externalOrderId }));

  return <>
    <table>
      <thead>
        <tr>
          <th scope="col">Pedido</th>
          <th scope="col">Fecha</th>
          <th scope="col">Cliente</th>
          <th scope="col">Total</th>
          <th scope="col">IVA</th>
          <th scope="col">Incidencias</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((order) => <tr key={order.externalOrderId}>
          <td>{order.externalOrderId}</td>
          <td>{order.commercialDate ? new Date(order.commercialDate).toLocaleDateString('es-ES') : '—'}</td>
          <td>{order.customerName ?? '—'}</td>
          <td>{order.totalAmount ?? '—'}</td>
          <td>{order.taxAmount ?? '—'}</td>
          <td>{issuesByOrder.has(order.externalOrderId) ? issuesByOrder.get(order.externalOrderId)!.join('; ') : '—'}</td>
        </tr>)}
      </tbody>
    </table>
    {generalIssues.length > 0 ? <GeneralIssuesList messages={generalIssues} /> : null}
  </>;
}

interface RoyaltyGroup {
  key: string;
  isbnOrAsin: string;
  format?: string;
  title?: string;
  currency: string;
  totalAmount: number;
  totalUnits: number;
  maxDate?: string;
  hasRefund: boolean;
}

/**
 * Groups royalty lines by isbnOrAsin+format (falling back to isbnOrAsin alone
 * when format is undefined, e.g. legacy KENP-only imports). Netting is a
 * plain sum of line.amount per group — previewKdpXlsx's own Resumen
 * cross-check already validates that Amazon's Regalías column for refund
 * rows is signed/net, so no separate subtraction step is invented here.
 */
function groupRoyaltyLines(lines: RoyaltyLine[]): RoyaltyGroup[] {
  const groups = new Map<string, RoyaltyGroup>();
  for (const line of lines) {
    const key = `${line.isbnOrAsin}::${line.format ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.totalAmount += line.amount;
      existing.totalUnits += line.unitsNet ?? 0;
      if (line.classification === 'reembolso') existing.hasRefund = true;
      if (line.date && (!existing.maxDate || line.date > existing.maxDate)) existing.maxDate = line.date;
      if (!existing.title && line.title) existing.title = line.title;
    } else {
      groups.set(key, {
        key,
        isbnOrAsin: line.isbnOrAsin,
        currency: line.currency,
        totalAmount: line.amount,
        totalUnits: line.unitsNet ?? 0,
        hasRefund: line.classification === 'reembolso',
        ...(line.format !== undefined ? { format: line.format } : {}),
        ...(line.title !== undefined ? { title: line.title } : {}),
        ...(line.date !== undefined ? { maxDate: line.date } : {}),
      });
    }
  }
  return [...groups.values()].sort((a, b) => (b.maxDate ?? '').localeCompare(a.maxDate ?? ''));
}

function KdpPreviewTable({ preview }: { preview: Preview }) {
  const lines = preview.royalty?.lines ?? [];
  const groups = groupRoyaltyLines(lines);
  const periods = preview.royalty?.statement.periods ?? [];
  // KDP issues reference a spreadsheet sheet/row, not an ISBN/ASIN, so they
  // can't be attributed to a specific royalty line the way Shopify's
  // order-prefixed issue messages can — shown as a general list instead,
  // labeled by sheet for context.
  const generalIssues = preview.issues.map((issue) => issue.sheet ? `[${issue.sheet}] ${issue.message}` : issue.message);

  return <>
    {periods.length > 0 ? <h3 className="period-header">{formatSpanishPeriodRange(periods)}</h3> : null}
    <table>
      <thead><tr><th scope="col">Título</th><th scope="col">ISBN/ASIN</th><th scope="col">Formato</th><th scope="col">Unidades</th><th scope="col">Importe</th></tr></thead>
      <tbody>
        {groups.map((group) => <tr key={group.key}>
          <td>{group.title ?? '—'}</td>
          <td>{group.isbnOrAsin}</td>
          <td>{group.format ? (royaltyClassificationLabels[group.format] ?? group.format) : '—'}</td>
          <td>{group.totalUnits}</td>
          <td>
            {group.totalAmount.toFixed(2)} {group.currency}
            {group.hasRefund ? <span className="refund-note"> (incluye reembolso)</span> : null}
          </td>
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
