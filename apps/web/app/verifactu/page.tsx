import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { VerifactuSubmissionsPanel } from './verifactu-submissions-panel';

export default function VerifactuPage() {
  return <AppShell>
    <PageHeader
      eyebrow="05 / INTEGRIDAD"
      title="VERI*FACTU"
      description="Estado de preparación de los registros VERI*FACTU generados desde la facturación fiscal. La integración de envío AEAT todavía no está activa."
      backHref="/"
    />
    <VerifactuSubmissionsPanel />
  </AppShell>;
}
