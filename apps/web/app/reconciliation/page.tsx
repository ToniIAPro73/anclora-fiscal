import Link from 'next/link';
import { ReconciliationWorkbench } from './workbench';

export default function ReconciliationPage() {
  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">03 / CONCILIACIÓN</span><h1>Conciliación</h1><p>Compara evidencia comercial y financiera caso a caso.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <ReconciliationWorkbench />
  </main>;
}
