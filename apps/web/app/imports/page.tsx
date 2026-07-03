import Link from 'next/link';
import { ImportUploader } from './uploader';

export default function ImportsPage() {
  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">01 / EVIDENCIA ORIGINAL</span><h1>Bandeja de importaciones</h1><p>Detecta, valida y previsualiza antes de crear operaciones.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <ImportUploader />
  </main>;
}
