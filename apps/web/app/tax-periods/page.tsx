import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { VatDossierPanel } from './vat-dossier-panel';

export default function TaxPeriodsPage() {
  return <AppShell>
    <PageHeader
      eyebrow="06 / CIERRE DE PERIODO"
      title="Periodos fiscales"
      description="Consulta o genera el expediente de IVA real de un periodo cerrado."
      backHref="/"
    />
    <VatDossierPanel />
  </AppShell>;
}
