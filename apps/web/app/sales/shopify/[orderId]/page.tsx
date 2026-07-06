import { PageHeader } from '@anclora/ui';
import { AppShell } from '../../../components/app-shell';
import { ShopifySaleDetail } from './sale-detail';

export default async function ShopifySalePage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <AppShell><PageHeader eyebrow="VENTA SHOPIFY" title="Expediente de venta" description="Cadena de evidencia comercial, de cobro, liquidación y decisión fiscal." backHref="/sales/shopify" /><ShopifySaleDetail orderId={orderId} /></AppShell>;
}
