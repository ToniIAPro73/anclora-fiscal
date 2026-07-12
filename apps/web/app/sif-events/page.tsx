import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { SifEventsPanel } from './sif-events-panel';

export default function SifEventsPage() {
  return <AppShell>
    <PageHeader
      eyebrow="06 / INTEGRIDAD"
      title="Eventos SIF"
      description="Registro encadenado de eventos del Sistema Informático de Facturación: arranques, paradas, errores de integridad y de envío, reintentos y anomalías."
      backHref="/"
    />
    <SifEventsPanel />
  </AppShell>;
}
