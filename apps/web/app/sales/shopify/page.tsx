import { PageHeader } from '@anclora/ui';
import { AppShell } from '../../components/app-shell';
import { OperationsTimeline } from './timeline';

export default function SalesShopifyPage() {
  return <AppShell>
    <PageHeader
      eyebrow="02 / EVIDENCIA CRUZADA"
      title="Ventas Shopify"
      description="Controla ventas, cobros, comisiones, reembolsos y liquidaciones de Shopify."
      backHref="/"
    />
    <OperationsTimeline />
  </AppShell>;
}
