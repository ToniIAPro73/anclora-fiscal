import Link from 'next/link';
import { OperationsTimeline } from './timeline';

export default function OperationsPage() {
  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">02 / EVIDENCIA CRUZADA</span><h1>Operaciones</h1><p>Cruza evidencia comercial y financiera antes de liquidar.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <OperationsTimeline />
  </main>;
}
