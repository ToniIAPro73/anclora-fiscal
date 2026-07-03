import Link from 'next/link';
import { StatusBadge } from '@anclora/ui';
import { buildDemoDossier } from './demo';

export default async function VatDossierPage() {
  const dossier = await buildDemoDossier();

  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">06 / CIERRE DE PERIODO</span><h1>Expedientes IVA</h1><p>Vista de demostración — no representa un cierre de periodo real.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <section className="vat-dossier">
      <span className="section-index">Vista de demostración</span>
      <StatusBadge tone="info">{dossier.status}</StatusBadge>
      <h2>Periodo {dossier.period}</h2>
      <table>
        <thead><tr><th scope="col">Fichero</th><th scope="col">SHA-256</th></tr></thead>
        <tbody>{Object.entries(dossier.manifest).map(([file, hash]) => <tr key={file}><td>{file}</td><td>{hash}</td></tr>)}</tbody>
      </table>
      <a href="/vat-dossier/zip">Descargar expediente ZIP</a>
    </section>
  </main>;
}
