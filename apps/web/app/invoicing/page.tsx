import Link from 'next/link';
import { InvoicingPanel } from './invoicing-panel';

export default function InvoicingPage() {
  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">04 / DOCUMENTO FISCAL</span><h1>Facturación</h1><p>Operaciones reales pendientes de facturar. La emisión requiere una decisión fiscal registrada.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <InvoicingPanel />
  </main>;
}
