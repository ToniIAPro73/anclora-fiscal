import { PageHeader } from '@anclora/ui';
import { AppShell } from '../../components/app-shell';
import { OperationsTimeline } from './timeline';

export default function SalesShopifyPage() {
  return <AppShell>
    <PageHeader
      eyebrow="02 / EVIDENCIA CRUZADA"
      title="Ventas Shopify"
      description="Cruza evidencia comercial y financiera antes de liquidar."
      backHref="/"
    />
    <OperationsTimeline />
  </AppShell>;
}
