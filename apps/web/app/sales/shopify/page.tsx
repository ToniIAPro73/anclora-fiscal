import { PageHeader } from '@anclora/ui';
import { AppShell } from '../../components/app-shell';
import { OperationsTimeline } from './timeline';

export default function SalesShopifyPage() {
  return <AppShell>
    <PageHeader
      eyebrow="02 / FLUJO DE VENTA"
      title="Ventas Shopify"
      description="Sigue cada pedido desde el cobro y el payout hasta su tratamiento fiscal y su factura."
      backHref="/"
    />
    <OperationsTimeline />
  </AppShell>;
}
