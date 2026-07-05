import { EmptyState, PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';

// No registers/ledger endpoint exists yet — honest "not built yet" state.
export default function RegistersPage() {
  return <AppShell>
    <PageHeader
      eyebrow="09 / REGISTROS"
      title="Registros"
      description="Todavía no hay un libro de registros unificado disponible."
      backHref="/"
    />
    <EmptyState
      title="Próximamente"
      description="Esta sección se activará cuando exista un endpoint real de registros contables/fiscales."
    />
  </AppShell>;
}
