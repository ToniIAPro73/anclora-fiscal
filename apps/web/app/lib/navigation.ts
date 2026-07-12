import type { Route } from 'next';

export type NavStatus = 'enabled' | 'requiresData' | 'advanced' | 'comingSoon';

export interface NavPendingCounts {
  openIssuesCount?: number;
  reconciliationTotal?: number;
}

export interface NavItem {
  label: string;
  href: Route;
  status: NavStatus;
  pendingCountKey?: keyof NavPendingCounts;
  /**
   * When set, the item is only rendered when the named boolean gating flag
   * (resolved by AppShell from the dashboard-summary endpoint) is true —
   * unlike `status: 'requiresData'`, which only decorates a badge, this
   * actually removes the item from the rendered nav list. Added for FASE 03:
   * "Conciliación" must stay hidden until the tenant has at least one
   * confirmed Shopify Payments import (`hasPayoutData`).
   */
  gatedBy?: 'hasPayoutData';
}

// Single source of truth for the sidebar. Both AppShell and the E2E
// navigation spec read from this array — no per-page nav/routes duplicates.
export const navigation: NavItem[] = [
  { label: 'Centro de control', href: '/', status: 'enabled' },
  { label: 'Importaciones', href: '/imports', status: 'enabled' },
  { label: 'Ventas Shopify', href: '/sales/shopify', status: 'enabled' },
  { label: 'Conciliación', href: '/reconciliation', status: 'requiresData', pendingCountKey: 'reconciliationTotal', gatedBy: 'hasPayoutData' },
  { label: 'Facturación', href: '/invoicing', status: 'enabled' },
  { label: 'VERI*FACTU', href: '/verifactu', status: 'advanced' },
  { label: 'Eventos SIF', href: '/sif-events', status: 'advanced' },
  { label: 'Reglas fiscales', href: '/tax-rules', status: 'enabled' },
  { label: 'Periodos fiscales', href: '/tax-periods', status: 'enabled' },
  { label: 'Asesoría', href: '/advisory', status: 'enabled' },
  { label: 'Liquidaciones KDP', href: '/settlements/kdp', status: 'comingSoon' },
  { label: 'Registros', href: '/registers', status: 'comingSoon' },
  { label: 'Configuración', href: '/settings', status: 'requiresData' },
];
