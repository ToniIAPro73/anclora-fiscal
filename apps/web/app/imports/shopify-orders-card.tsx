'use client';

import { useState } from 'react';
import { FieldLabel } from '@anclora/ui';
import { ImportCard } from './import-card';
import type { CommercialOrderPreview, ImportIssue, PreviewResponse } from './types';

function OrdersPreviewTable({ preview, issuesByPosition }: { preview: PreviewResponse; issuesByPosition: Map<number, ImportIssue[]> }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productNature, setProductNature] = useState('');

  const rows: CommercialOrderPreview[] = preview.shopifyOrders?.orders.map((order) => ({ ...order, externalOrderId: order.orderName })) ?? preview.commercialOrders
    ?? preview.summary.orderIds.map((externalOrderId) => ({ externalOrderId }));
  const filteredRows = rows.filter((order) =>
    (!dateFrom || Boolean(order.commercialDate && order.commercialDate.slice(0, 10) >= dateFrom))
    && (!dateTo || Boolean(order.commercialDate && order.commercialDate.slice(0, 10) <= dateTo))
    && (!productNature || order.productNature === productNature));

  return <>
    <div className="operation-filters" aria-label="Filtros de pedidos Shopify">
      <div><FieldLabel htmlFor="shopify-orders-date-from">Fecha desde</FieldLabel><input id="shopify-orders-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
      <div><FieldLabel htmlFor="shopify-orders-date-to">Fecha hasta</FieldLabel><input id="shopify-orders-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
      <div><FieldLabel htmlFor="shopify-orders-product">Tipo de producto</FieldLabel><select id="shopify-orders-product" value={productNature} onChange={(event) => setProductNature(event.target.value)}><option value="">Todos</option><option value="ebook">eBook</option><option value="general">Tapa blanda / general</option></select></div>
    </div>
    <table>
      <thead>
        <tr>
          <th scope="col">Pedido</th>
          <th scope="col">Fecha</th>
          <th scope="col">Estado</th>
          <th scope="col">Líneas</th>
          <th scope="col">Total</th>
          <th scope="col">IVA</th>
          <th scope="col">Incidencias</th>
        </tr>
      </thead>
      <tbody>
        {filteredRows.map((order, index) => {
          const rowIssues = issuesByPosition.get(index + 1) ?? [];
          return <tr key={order.externalOrderId}>
            <td>{order.externalOrderId}</td>
            <td>{order.commercialDate ? new Date(order.commercialDate).toLocaleDateString('es-ES') : '—'}</td>
            <td>{preview.shopifyOrders?.orders[index]?.financialStatus ?? order.customerName ?? '—'}</td>
            <td>{preview.shopifyOrders?.orders[index]?.lines.length ?? '—'}</td>
            <td>{order.totalAmount ?? '—'}</td>
            <td>{order.taxAmount ?? '—'}</td>
            <td>{rowIssues.length > 0 ? rowIssues.map((issue) => `${issue.code}: ${issue.message}`).join('; ') : '—'}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </>;
}

export function ShopifyOrdersCard() {
  return <ImportCard
    connectorId="shopify-orders"
    title="Shopify — Pedidos"
    description="CSV exportado desde Orders. Crea pedidos y líneas comerciales al confirmar."
    accept=".csv,text/csv"
    fileFieldId="shopify-orders-file"
    fileFieldLabel="Archivo de pedidos Shopify"
    hint="CSV de pedidos Shopify · máximo 15 MB"
    renderPreviewTable={(preview, issuesByPosition) => <OrdersPreviewTable preview={preview} issuesByPosition={issuesByPosition} />}
    nextStepsNote="Próximos pasos: la facturación automática de estos pedidos llega en una fase posterior y todavía no está disponible."
  />;
}
