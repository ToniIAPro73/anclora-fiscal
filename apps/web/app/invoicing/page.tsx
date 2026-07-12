import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { InvoicingPanel } from './invoicing-panel';

export default function InvoicingPage() {
  return <AppShell>
    <PageHeader
      eyebrow="04 / DOCUMENTO FISCAL"
      title="Facturación"
      description="Revisa qué ventas están listas para emitir, cuáles están bloqueadas y qué documentos ya se han generado."
      backHref="/"
    />
    <InvoicingPanel />
  </AppShell>;
}
