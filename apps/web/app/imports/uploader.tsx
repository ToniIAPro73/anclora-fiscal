'use client';

import { useMemo, useState } from 'react';
import { KdpRoyaltiesCard } from './kdp-royalties-card';
import { ShopifyOrdersCard } from './shopify-orders-card';
import { ShopifyPaymentsCard } from './shopify-payments-card';
import { ShopifyOrderTransactionsCard } from './shopify-order-transactions-card';
import { ExpensesCsvCard } from './expenses-csv-card';

type ImportPlatform = 'shopify' | 'amazon-kdp' | 'expenses';

type ImportKind =
  | 'shopify-orders'
  | 'shopify-order-transactions'
  | 'shopify-payments'
  | 'amazon-kdp-royalties'
  | 'expenses-csv';

interface ImportTypeOption {
  platform: ImportPlatform;
  kind: ImportKind;
  label: string;
  description: string;
}

const platformOptions: Array<{ value: ImportPlatform; label: string }> = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'amazon-kdp', label: 'Amazon KDP' },
  { value: 'expenses', label: 'Gastos' },
];

const importTypes: ImportTypeOption[] = [
  { platform: 'expenses', kind: 'expenses-csv', label: 'Facturas recibidas CSV', description: 'Importación con preview, incidencias e idempotencia.' },
  {
    platform: 'shopify',
    kind: 'shopify-orders',
    label: 'Pedidos',
    description: 'CSV exportado desde Orders. Crea pedidos y líneas comerciales al confirmar.',
  },
  {
    platform: 'shopify',
    kind: 'shopify-order-transactions',
    label: 'Transacciones de pedido',
    description: 'Historial de cobros, autorizaciones y devoluciones asociado a cada pedido.',
  },
  {
    platform: 'shopify',
    kind: 'shopify-payments',
    label: 'Payments — Movimientos y liquidación',
    description: 'Movimientos, comisiones y netos de Shopify Payments.',
  },
  {
    platform: 'amazon-kdp',
    kind: 'amazon-kdp-royalties',
    label: 'Regalías',
    description: 'XLSX de liquidaciones de regalías de Amazon KDP.',
  },
];

function renderImportCard(kind: ImportKind) {
  switch (kind) {
    case 'shopify-orders':
      return <ShopifyOrdersCard />;
    case 'shopify-order-transactions':
      return <ShopifyOrderTransactionsCard />;
    case 'shopify-payments':
      return <ShopifyPaymentsCard />;
    case 'amazon-kdp-royalties':
      return <KdpRoyaltiesCard />;
    case 'expenses-csv':
      return <ExpensesCsvCard />;
  }
}

export function ImportUploader() {
  const [platform, setPlatform] = useState<ImportPlatform | ''>('');
  const [kind, setKind] = useState<ImportKind | ''>('');

  const availableTypes = useMemo(
    () => importTypes.filter((option) => option.platform === platform),
    [platform],
  );

  const selectedType = importTypes.find((option) => option.kind === kind);

  return <section className="import-workbench import-workbench-single">
    <div className="drop-panel import-source-selector" aria-label="Seleccionar fuente de importación">
      <div>
        <span className="section-index">Fuente de importación</span>
        <h2>Selecciona qué evidencia quieres importar</h2>
        <p>Elige primero la plataforma y después el tipo de archivo. La tarjeta de carga se adapta automáticamente a esa selección.</p>
      </div>

      <div className="import-source-selector-fields">
        <label htmlFor="import-platform">
          Plataforma
          <select
            id="import-platform"
            value={platform}
            onChange={(event) => {
              setPlatform(event.target.value as ImportPlatform | '');
              setKind('');
            }}
          >
            <option value="">Selecciona plataforma</option>
            {platformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label htmlFor="import-kind">
          Tipo de importación
          <select
            id="import-kind"
            value={kind}
            disabled={!platform}
            onChange={(event) => setKind(event.target.value as ImportKind | '')}
          >
            <option value="">Selecciona tipo</option>
            {availableTypes.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {selectedType ? <p role="status">{selectedType.description}</p> : <p role="status">Selecciona plataforma y tipo de importación para activar la carga del archivo.</p>}
    </div>

    {kind ? <div className="import-selected-card" key={kind}>
      {renderImportCard(kind)}
    </div> : <article className="import-card import-card-placeholder" aria-label="Importación pendiente de selección">
      <header>
        <h2>Archivo pendiente de selección</h2>
        <p>Cuando selecciones plataforma y tipo de importación, aparecerá aquí la zona para adjuntar el archivo y generar la vista previa.</p>
      </header>
      <div className="drop-panel">
        <p>Sin fuente seleccionada.</p>
        <button type="button" disabled>Generar vista previa</button>
      </div>
    </article>}
  </section>;
}
