import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { TaxSimulator } from './simulator';

export default function TaxRulesPage() {
  return <AppShell>
    <PageHeader
      eyebrow="03 / REGLA VERSIONADA"
      title="Reglas fiscales"
      description="Simula decisiones sin modificar operaciones ni emitir documentos."
      backHref="/"
    />
    <TaxSimulator />
  </AppShell>;
}
