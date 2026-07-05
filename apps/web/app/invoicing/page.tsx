import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { InvoicingPanel } from './invoicing-panel';

export default function InvoicingPage() {
  return <AppShell>
    <PageHeader
      eyebrow="04 / DOCUMENTO FISCAL"
      title="Facturación"
      description="Operaciones reales pendientes de facturar. La emisión requiere una decisión fiscal registrada."
      backHref="/"
    />
    <InvoicingPanel />
  </AppShell>;
}
