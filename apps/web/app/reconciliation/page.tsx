import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { ReconciliationWorkbench } from './workbench';

export default function ReconciliationPage() {
  return <AppShell>
    <PageHeader
      eyebrow="03 / CONCILIACIÓN"
      title="Conciliación"
      description="Compara evidencia comercial y financiera caso a caso."
      backHref="/"
    />
    <ReconciliationWorkbench />
  </AppShell>;
}
