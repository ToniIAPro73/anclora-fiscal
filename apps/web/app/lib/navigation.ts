import type { Route } from 'next';

export type NavStatus = 'enabled' | 'requiresData' | 'advanced' | 'comingSoon';

export interface NavPendingCounts {
  openIssuesCount?: number;
  reconciliationTotal?: number;
}

export type NavGroup = 'operations' | 'compliance' | 'management' | 'system';

export const navGroupLabels: Record<NavGroup, string> = {
  operations: 'Operaciones',
  compliance: 'Cumplimiento',
  management: 'Gestión',
  system: 'Sistema',
};

export interface NavItem {
  label: string;
  href: Route;
  status: NavStatus;
  group: NavGroup;
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
// Items are grouped (`group`) so the sidebar can render section headers
// instead of one long flat list.
export const navigation: NavItem[] = [
  { label: 'Centro de control', href: '/', status: 'enabled', group: 'operations' },
  { label: 'Importaciones', href: '/imports', status: 'enabled', group: 'operations' },
  { label: 'Ventas Shopify', href: '/sales/shopify', status: 'enabled', group: 'operations' },
  { label: 'Conciliación', href: '/reconciliation', status: 'requiresData', pendingCountKey: 'reconciliationTotal', gatedBy: 'hasPayoutData', group: 'operations' },
  { label: 'Facturación', href: '/invoicing', status: 'enabled', group: 'operations' },
  { label: 'VERI*FACTU', href: '/verifactu', status: 'advanced', group: 'compliance' },
  { label: 'Eventos SIF', href: '/sif-events', status: 'advanced', group: 'compliance' },
  { label: 'Reglas fiscales', href: '/tax-rules', status: 'enabled', group: 'compliance' },
  { label: 'Periodos fiscales', href: '/tax-periods', status: 'enabled', group: 'compliance' },
  { label: 'Asesoría', href: '/advisory', status: 'enabled', group: 'management' },
  { label: 'Gastos', href: '/expenses', status: 'enabled', group: 'management' },
  { label: 'Liquidaciones KDP', href: '/settlements/kdp', status: 'comingSoon', group: 'management' },
  { label: 'Registros', href: '/registers', status: 'comingSoon', group: 'system' },
  { label: 'Configuración', href: '/settings', status: 'requiresData', group: 'system' },
];
