'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import medal from '../../../../packages/ui/assets/brand/anclora-fiscal-medalla-oro-transparente.png';
import tenantMedal from '../../../../packages/ui/assets/brand/anclora-insights-medalla-oro-transparente.png';
import { navigation, type NavPendingCounts } from '../lib/navigation';
import { LogoutButton } from '../logout-button';

export interface AppShellProps {
  children: ReactNode;
  pendingCounts?: NavPendingCounts | undefined;
}

export function AppShell({ children, pendingCounts }: AppShellProps) {
  const pathname = usePathname();

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup" aria-label="Anclora Fiscal">
        <span className="brand-medal"><Image src={medal} alt="" priority /></span>
        <span>Anclora <em>Fiscal</em></span>
      </div>
      <nav aria-label="Navegación principal">
        {navigation.map((item) => {
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
