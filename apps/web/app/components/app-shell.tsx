'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import medal from '../../../../packages/ui/assets/brand/anclora-fiscal-medalla-oro-transparente.png';
import { LogoutButton } from '../logout-button';
import { navigation, type NavPendingCounts } from '../lib/navigation';

const SIDEBAR_STORAGE_KEY = 'anclora-fiscal.sidebar-collapsed';

function getNavShortLabel(label: string): string {
  const compactLabels: Record<string, string> = {
    'Centro de control': 'CC',
    Importaciones: 'IM',
    'Ventas Shopify': 'VS',
    Conciliación: 'CO',
    Facturación: 'FA',
    'VERI*FACTU': 'VF',
    'Reglas fiscales': 'RF',
    'Periodos fiscales': 'PF',
    'Liquidaciones KDP': 'KD',
    Registros: 'RG',
    Configuración: 'CF',
  };

  return compactLabels[label] ?? label.slice(0, 2).toUpperCase();
}

export interface AppShellProps {
  children: ReactNode;
  pendingCounts?: NavPendingCounts | undefined;

  /**
   * Determines whether there is at least one confirmed Shopify Payments
   * import. It controls the visibility of Conciliación.
   *
   * When omitted, AppShell obtains the information from dashboard-summary.
   * When a page already knows the value, it can pass it to avoid a duplicate
   * request.
   */
  hasPayoutData?: boolean | undefined;
}

export function AppShell({
  children,
  pendingCounts,
  hasPayoutData,
}: AppShellProps) {
  const pathname = usePathname();

  const [fetchedHasPayoutData, setFetchedHasPayoutData] = useState<boolean>();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [criticalAlerts, setCriticalAlerts] = useState(0);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      setIsSidebarCollapsed(storedValue === 'true');
    } catch {
      // El sidebar permanece expandido si localStorage no está disponible.
    }
  }, []);

  useEffect(() => {
    if (hasPayoutData !== undefined) return;

    let cancelled = false;

    async function loadDashboardSummary() {
      try {
        const response = await fetch('/api/v1/dashboard/summary', {
          credentials: 'include',
        });

        if (!response.ok) return;

        const data = (await response.json()) as {
          hasPayoutData?: boolean;
        };

        if (!cancelled) {
          setFetchedHasPayoutData(Boolean(data.hasPayoutData));
        }
      } catch {
        // Si no se puede obtener el resumen, Conciliación permanece oculta.
      }
    }

    void loadDashboardSummary();

    return () => {
      cancelled = true;
    };
  }, [hasPayoutData]);

  useEffect(() => {
    fetch('/api/v1/system-alerts?status=OPEN', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((data: { items?: Array<{ severity: string }> }) => setCriticalAlerts((data.items ?? []).filter((alert) => alert.severity === 'CRITICAL').length))
      .catch(() => undefined);
  }, [pathname]);

  function toggleSidebar() {
    setIsSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;

      try {
        window.localStorage.setItem(
          SIDEBAR_STORAGE_KEY,
          String(nextValue),
        );
      } catch {
        // El estado visual cambia aunque no sea posible persistirlo.
      }

      return nextValue;
    });
  }

  const resolvedHasPayoutData =
    hasPayoutData ?? fetchedHasPayoutData ?? false;

  const visibleNavigation = navigation.filter(
    (item) =>
      item.gatedBy !== 'hasPayoutData' || resolvedHasPayoutData,
  );

  return (
    <main
      className={`app-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      <aside className="sidebar">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={
            isSidebarCollapsed
              ? 'Expandir barra lateral'
              : 'Contraer barra lateral'
          }
          aria-expanded={!isSidebarCollapsed}
          title={
            isSidebarCollapsed
              ? 'Expandir barra lateral'
              : 'Contraer barra lateral'
          }
        >
          {isSidebarCollapsed ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9.5 6 6 6-6 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.5 6 8.5 12l6 6" />
            </svg>
          )}
        </button>

        <div className="brand-lockup" aria-label="Anclora Fiscal">
          <span className="brand-medal">
            <Image src={medal} alt="" priority />
          </span>

          <span>
            Anclora <em>Fiscal</em>
          </span>
        </div>

        <nav aria-label="Navegación principal">
          {visibleNavigation.map((item) => {
            if (item.status === 'comingSoon') {
              return (
                <span
                  key={item.href}
                  className="nav-item nav-item-disabled"
                  aria-disabled="true"
                  aria-label={`${item.label} — Próximamente disponible`}
                  title={`${item.label} — Próximamente disponible`}
                >
                  <span className="nav-rail-token" aria-hidden="true">
                    {getNavShortLabel(item.label)}
                  </span>

                  <span className="nav-label">{item.label}</span>

                  <span className="nav-badge-soon">Próx.</span>
                </span>
              );
            }

            const isActive = pathname === item.href;

            const pendingCount = item.pendingCountKey
              ? pendingCounts?.[item.pendingCountKey]
              : undefined;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? 'active' : ''}
                aria-current={isActive ? 'page' : undefined}
                aria-label={isSidebarCollapsed ? item.label : undefined}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <span className="nav-rail-token" aria-hidden="true">
                  {getNavShortLabel(item.label)}
                </span>

                <span className="nav-label">{item.label}</span>

                {pendingCount ? (
                  <span
                    className="nav-badge"
                    aria-label={`${pendingCount} pendientes`}
                  >
                    {pendingCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <LogoutButton compact={isSidebarCollapsed} />
        </div>
      </aside>

      <section className="workspace">
        {criticalAlerts > 0 ? <div className="integrity-alert-banner" role="alert"><strong>Alerta crítica de integridad abierta</strong><span>{criticalAlerts} incidencia(s) requieren resolución explícita.</span><Link href="/sif-events">Ver detalle</Link></div> : null}
        {children}
      </section>
    </main>
  );
}
