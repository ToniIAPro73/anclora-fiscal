import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('AppShell', () => {
  it('renders every enabled nav item as a link', () => {
    mockPathname = '/';
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole('link', { name: /Centro de control/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Importaciones/ })).toHaveAttribute('href', '/imports');
    expect(screen.getByRole('link', { name: /Ventas Shopify/ })).toHaveAttribute('href', '/sales/shopify');
    expect(screen.getByRole('link', { name: /Facturación/ })).toHaveAttribute('href', '/invoicing');
    expect(screen.getByRole('link', { name: /Reglas fiscales/ })).toHaveAttribute('href', '/tax-rules');
    expect(screen.getByRole('link', { name: /Periodos fiscales/ })).toHaveAttribute('href', '/tax-periods');
  });

  it('marks the active item based on the current pathname', () => {
    mockPathname = '/imports';
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole('link', { name: /Importaciones/ })).toHaveClass('active');
    expect(screen.getByRole('link', { name: /Importaciones/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Centro de control/ })).not.toHaveClass('active');
  });

  it('disables comingSoon items instead of linking to them', () => {
    mockPathname = '/';
    render(<AppShell>content</AppShell>);
    expect(screen.queryByRole('link', { name: /Liquidaciones KDP/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Registros/ })).not.toBeInTheDocument();
    const disabledItem = screen.getByText('Liquidaciones KDP').closest('span');
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Próximamente').length).toBeGreaterThan(0);
  });

  it('shows the pending-count badge for items with pendingCountKey data', () => {
    mockPathname = '/';
    render(<AppShell pendingCounts={{ reconciliationTotal: 4 }}>content</AppShell>);
    expect(screen.getByLabelText('4 pendientes')).toBeInTheDocument();
  });

  it('omits the badge when there is no pending count', () => {
    mockPathname = '/';
    render(<AppShell>content</AppShell>);
    expect(screen.queryByLabelText(/pendientes/)).not.toBeInTheDocument();
  });

  it('renders children in the workspace section', () => {
    mockPathname = '/';
    render(<AppShell><p>Panel content</p></AppShell>);
    expect(screen.getByText('Panel content')).toBeInTheDocument();
  });
});
