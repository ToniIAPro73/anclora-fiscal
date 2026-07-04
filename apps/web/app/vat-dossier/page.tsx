import Link from 'next/link';
import { VatDossierPanel } from './vat-dossier-panel';

export default function VatDossierPage() {
  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">06 / CIERRE DE PERIODO</span><h1>Expedientes IVA</h1><p>Consulta o genera el expediente de IVA real de un periodo cerrado.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <VatDossierPanel />
  </main>;
}
