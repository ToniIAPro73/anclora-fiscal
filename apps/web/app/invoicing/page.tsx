import Link from 'next/link';
import { StatusBadge } from '@anclora/ui';
import { buildDemoInvoices } from './demo';

const statusLabels: Record<string, string> = { ISSUED: 'Emitida' };

export default async function InvoicingPage() {
  const { original, rectified } = await buildDemoInvoices();
  const documents = [original, rectified];

  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">04 / DOCUMENTO FISCAL</span><h1>Facturación</h1><p>Vista de demostración — no se emite factura real ni se numera una serie de producción.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <section className="invoicing-documents">
      <span className="section-index">Caso de referencia AI-1001</span>
      {documents.map((document) => <article key={document.id} className="invoice-card">
        <StatusBadge tone={document.type === 'RECTIFYING_INVOICE' ? 'warning' : 'info'}>{document.type === 'RECTIFYING_INVOICE' ? 'Rectificativa' : 'Factura'}</StatusBadge>
        <h2>{document.number}</h2>
        <dl>
          <div><dt>Estado</dt><dd>{statusLabels[document.status] ?? document.status}</dd></div>
          <div><dt>Base</dt><dd>{document.input.taxBase.toFixed(2)} EUR</dd></div>
          <div><dt>Cuota</dt><dd>{document.input.taxAmount.toFixed(2)} EUR</dd></div>
          <div><dt>Total</dt><dd>{document.input.totalAmount.toFixed(2)} EUR</dd></div>
        </dl>
        <a href={`/invoicing/pdf?number=${encodeURIComponent(document.number)}`}>Descargar PDF</a>
      </article>)}
    </section>
  </main>;
}
