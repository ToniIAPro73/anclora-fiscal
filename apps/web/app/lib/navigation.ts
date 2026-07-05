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
}

// Single source of truth for the sidebar. Both AppShell and the E2E
// navigation spec read from this array — no per-page nav/routes duplicates.
export const navigation: NavItem[] = [
  { label: 'Centro de control', href: '/', status: 'enabled' },
  { label: 'Importaciones', href: '/imports', status: 'enabled' },
  { label: 'Ventas Shopify', href: '/sales/shopify', status: 'enabled' },
  { label: 'Conciliación', href: '/reconciliation', status: 'requiresData', pendingCountKey: 'reconciliationTotal' },
  { label: 'Facturación', href: '/invoicing', status: 'enabled' },
  { label: 'VERI*FACTU', href: '/verifactu', status: 'advanced' },
  { label: 'Reglas fiscales', href: '/tax-rules', status: 'enabled' },
  { label: 'Periodos fiscales', href: '/tax-periods', status: 'enabled' },
  { label: 'Liquidaciones KDP', href: '/settlements/kdp', status: 'comingSoon' },
  { label: 'Registros', href: '/registers', status: 'comingSoon' },
  { label: 'Configuración', href: '/settings', status: 'requiresData' },
];
