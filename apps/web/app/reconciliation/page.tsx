import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { ReconciliationWorkbench } from './workbench';

export default function ReconciliationPage() {
  return <AppShell>
    <PageHeader
      eyebrow="03 / CONCILIACIÓN"
      title="Cobros y liquidación Shopify"
      description="Revisa los enlaces entre pedidos, transacciones y movimientos. Una liquidación identificada no acredita por sí sola el cobro bancario."
      backHref="/"
    />
    <ReconciliationWorkbench />
  </AppShell>;
}
