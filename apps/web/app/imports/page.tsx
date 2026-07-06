import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { ImportUploader } from './uploader';

export default function ImportsPage() {
  return <AppShell>
    <PageHeader
      eyebrow="01 / EVIDENCIA ORIGINAL"
      title="Bandeja de importaciones"
      description="Analiza cada fuente por separado y confirma sólo después de revisar su evidencia."
      backHref="/"
    />
    <ImportUploader />
  </AppShell>;
}
