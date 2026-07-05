'use client';

import { useState } from 'react';
import { FieldLabel } from '@anclora/ui';
import { ImportCard } from './import-card';
import { formatSpanishPeriodRange } from '../lib/spanish-months';
import type { ImportIssue, PreviewResponse, RoyaltyLine } from './types';

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
 * when format is undefined). Netting is a plain sum of line.amount per group.
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

function KdpPreviewTable({ preview, issuesByPosition }: { preview: PreviewResponse; issuesByPosition: Map<number, ImportIssue[]> }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState('');
  const lines = (preview.royalty?.lines ?? []).filter((line) =>
    (!dateFrom || Boolean(line.date && line.date >= dateFrom))
    && (!dateTo || Boolean(line.date && line.date <= dateTo))
    && (!format || line.format === format));
  const groups = groupRoyaltyLines(lines);
  const periods = preview.royalty?.statement.periods ?? [];
  const generalIssues = [...issuesByPosition.entries()].flatMap(([position, issues]) =>
    issues.map((issue) => `Fila ${position} — ${issue.code}: ${issue.message} ${issue.suggestedAction}`));

  return <>
    {periods.length > 0 ? <h3 className="period-header">{formatSpanishPeriodRange(periods)}</h3> : null}
    <div className="operation-filters" aria-label="Filtros de regalías KDP">
      <div><FieldLabel htmlFor="kdp-royalties-date-from">Fecha desde</FieldLabel><input id="kdp-royalties-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
      <div><FieldLabel htmlFor="kdp-royalties-date-to">Fecha hasta</FieldLabel><input id="kdp-royalties-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
      <div><FieldLabel htmlFor="kdp-royalties-format">Tipo de producto</FieldLabel><select id="kdp-royalties-format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="">Todos</option><option value="ebook">eBook</option><option value="impreso">Tapa blanda</option></select></div>
    </div>
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
    {generalIssues.length > 0 ? <div className="general-issues">
      <span className="section-index">Otras incidencias</span>
      <ul>{generalIssues.map((message) => <li key={message}>{message}</li>)}</ul>
    </div> : null}
  </>;
}

export function KdpRoyaltiesCard() {
  return <ImportCard
    connectorId="amazon-kdp-royalties"
    title="Amazon KDP — Regalías"
    description="Analiza y confirma liquidaciones de regalías de Amazon KDP."
    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    fileFieldId="kdp-royalties-file"
    fileFieldLabel="Archivo de regalías KDP"
    hint="XLSX de liquidaciones Amazon KDP · máximo 15 MB"
    renderPreviewTable={(preview, issuesByPosition) => <KdpPreviewTable preview={preview} issuesByPosition={issuesByPosition} />}
  />;
}
