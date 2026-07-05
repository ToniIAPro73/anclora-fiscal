import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { ImportUploader } from './uploader';

export default function ImportsPage() {
  return <AppShell>
    <PageHeader
      eyebrow="01 / EVIDENCIA ORIGINAL"
      title="Bandeja de importaciones"
      description="Detecta, valida y previsualiza antes de crear operaciones."
      backHref="/"
    />
    <ImportUploader />
  </AppShell>;
}
