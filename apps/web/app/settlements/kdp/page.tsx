import { EmptyState, PageHeader } from '@anclora/ui';
import { AppShell } from '../../components/app-shell';

// No liquidaciones KDP endpoint exists yet — this is an honest "not built
// yet" state rather than fabricated settlement figures.
export default function SettlementsKdpPage() {
  return <AppShell>
    <PageHeader
      eyebrow="08 / LIQUIDACIONES"
      title="Liquidaciones KDP"
      description="Todavía no hay un flujo de liquidación de regalías KDP disponible."
      backHref="/"
    />
    <EmptyState
      title="Próximamente"
      description="Esta sección se activará cuando exista un endpoint real de liquidaciones KDP. Por ahora puedes revisar las regalías importadas desde el centro de control."
    />
  </AppShell>;
}
