import Link from 'next/link';
import { createIntegrityRecord, MockVerifactuAdapter, verifyIntegrityChain } from '@anclora/core/server';
import { StatusBadge } from '@anclora/ui';
import { buildDemoInvoices } from '../invoicing/demo';

export default async function VerifactuPage() {
  const { original, rectified } = await buildDemoInvoices();
  const enabled = process.env.VERIFACTU_ENABLED === 'true';

  const first = createIntegrityRecord({
    documentId: original.id, documentNumber: original.number, recordType: 'ALTA',
    issuedAt: original.input.issuedAt, totalAmount: original.input.totalAmount, taxAmount: original.input.taxAmount,
  }, '2026-07-01T10:00:00Z');
  const second = createIntegrityRecord({
    documentId: rectified.id, documentNumber: rectified.number, recordType: 'ANULACION',
    issuedAt: rectified.input.issuedAt, totalAmount: rectified.input.totalAmount, taxAmount: rectified.input.taxAmount,
    previousHash: first.hash,
  }, '2026-07-03T10:00:00Z');
  const records = [first, second];
  const chainValid = verifyIntegrityChain(records);

  const adapter = new MockVerifactuAdapter(true);
  const submissions = await Promise.all(records.map((record) => adapter.submit(record)));

  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">05 / INTEGRIDAD</span><h1>VERI*FACTU</h1><p>Cadena de integridad y envío simulado, sin conexión real con la AEAT.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <div className="verifactu-banner" role="status">
      {enabled
        ? 'VERIFACTU_ENABLED=true — vista de demostración; ningún envío real ha ocurrido, no se declara cumplimiento normativo.'
        : 'VERI*FACTU desactivado (VERIFACTU_ENABLED=false) — vista de demostración, ningún envío real ha ocurrido, no se declara cumplimiento normativo.'}
    </div>
    <section className="verifactu-chain">
      <span className="section-index">Vista de demostración</span>
      <StatusBadge tone={chainValid ? 'info' : 'blocking'}>{chainValid ? 'Cadena íntegra' : 'Cadena rota'}</StatusBadge>
      <ol className="evidence-thread">
        {records.map((record, index) => <li key={record.hash}>
          <strong>{record.recordType} · {record.documentNumber}</strong>
          <p>hash {record.hash.slice(0, 16)}…{record.previousHash ? ` · anterior ${record.previousHash.slice(0, 16)}…` : ' · primer registro'}</p>
          <StatusBadge tone={submissions[index]?.status === 'ACCEPTED' ? 'info' : 'warning'}>{submissions[index]?.status}</StatusBadge>
        </li>)}
      </ol>
    </section>
  </main>;
}
