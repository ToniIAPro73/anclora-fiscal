import Link from 'next/link';
import { StatusBadge } from '@anclora/ui';
import { buildDemoDossier } from './demo';

const fileDescriptions: Record<string, string> = {
  'facturas.csv': 'Listado de facturas del periodo (CSV)',
  'facturas.xlsx': 'Listado de facturas del periodo (Excel)',
  'resumen-iva.pdf': 'Resumen ejecutivo de IVA (PDF)',
  'estado-verifactu.json': 'Estado de los envíos VERI*FACTU (JSON)',
};

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
        <thead><tr><th scope="col">Fichero</th><th scope="col">Descripción</th></tr></thead>
        <tbody>{Object.entries(dossier.manifest).map(([file]) => <tr key={file}><td>{file}</td><td>{fileDescriptions[file] ?? 'Fichero del expediente'}</td></tr>)}</tbody>
      </table>
      <a href="/vat-dossier/zip">Descargar expediente ZIP</a>
    </section>
  </main>;
}
