'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import medal from '../../../../packages/ui/assets/brand/anclora-fiscal-medalla-oro-transparente.png';
import tenantMedal from '../../../../packages/ui/assets/brand/anclora-insights-medalla-oro-transparente.png';
import { navigation, type NavPendingCounts } from '../lib/navigation';
import { LogoutButton } from '../logout-button';

export interface AppShellProps {
  children: ReactNode;
  pendingCounts?: NavPendingCounts | undefined;
  /**
   * Whether the tenant has at least one confirmed Shopify Payments import —
   * gates the "Conciliación" nav item. When a page has already fetched
   * dashboard-summary (e.g. the dashboard itself), pass the known value
   * directly to avoid a duplicate network call. When omitted, AppShell
   * fetches it itself so nav gating still works on pages that don't already
   * load the summary (e.g. /imports).
   */
  hasPayoutData?: boolean | undefined;
}

export function AppShell({ children, pendingCounts, hasPayoutData }: AppShellProps) {
  const pathname = usePathname();
  const [fetchedHasPayoutData, setFetchedHasPayoutData] = useState<boolean>();

  useEffect(() => {
    if (hasPayoutData !== undefined) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/v1/dashboard/summary', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json() as { hasPayoutData?: boolean };
        if (!cancelled) setFetchedHasPayoutData(Boolean(data.hasPayoutData));
      } catch {
        // Nav gating fails closed (item stays hidden) when the summary can't be fetched.
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [hasPayoutData]);

  const resolvedHasPayoutData = hasPayoutData ?? fetchedHasPayoutData ?? false;
  const visibleNavigation = navigation.filter((item) => item.gatedBy !== 'hasPayoutData' || resolvedHasPayoutData);

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup" aria-label="Anclora Fiscal">
        <span className="brand-medal"><Image src={medal} alt="" priority /></span>
        <span>Anclora <em>Fiscal</em></span>
      </div>
      <nav aria-label="Navegación principal">
        {visibleNavigation.map((item) => {
          if (item.status === 'comingSoon') {
            return <span
              key={item.href}
              className="nav-item nav-item-disabled"
              aria-disabled="true"
              title="Próximamente disponible"
            >
              {item.label}
              <span className="nav-badge-soon">Próximamente</span>
            </span>;
          }
          const isActive = pathname === item.href;
          const pendingCount = item.pendingCountKey ? pendingCounts?.[item.pendingCountKey] : undefined;
          return <Link
            key={item.href}
            href={item.href}
            className={isActive ? 'active' : ''}
            aria-current={isActive ? 'page' : undefined}
          >
            <span>{item.label}</span>
            {pendingCount ? <span className="nav-badge" aria-label={`${pendingCount} pendientes`}>{pendingCount}</span> : null}
          </Link>;
        })}
      </nav>
      <div className="tenant">
        <span className="tenant-medal"><Image src={tenantMedal} alt="" /></span>
        <div><strong>Anclora Insights</strong><small>Entidad activa · EUR</small></div>
      </div>
      <LogoutButton />
    </aside>
    <section className="workspace">{children}</section>
  </main>;
}
