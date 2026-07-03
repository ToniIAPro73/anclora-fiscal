import { TaxSimulator } from './simulator';
import Link from 'next/link';

export default function TaxEnginePage() {
  return <main className="imports-page"><header className="imports-header"><div><span className="eyebrow">03 / REGLA VERSIONADA</span><h1>Simulador fiscal</h1><p>Simula decisiones sin modificar operaciones ni emitir documentos.</p></div><Link href="/">Volver al centro de control</Link></header><TaxSimulator /></main>;
}
