'use client';

import { KdpRoyaltiesCard } from './kdp-royalties-card';
import { ShopifyOrdersCard } from './shopify-orders-card';
import { ShopifyPaymentsCard } from './shopify-payments-card';

/**
 * Container composing the three FASE 03 connector-specific import cards.
 * Each card owns its own file-select → analyze → preview → confirm/reject
 * state machine (see `import-card.tsx`) — this component only lays them out.
 */
export function ImportUploader() {
  return <section className="import-workbench">
    <ShopifyOrdersCard />
    <ShopifyPaymentsCard />
    <KdpRoyaltiesCard />
  </section>;
}
