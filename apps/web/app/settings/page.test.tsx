import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/settings' }));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ legalEntity: null, readiness: { ready: false, missing: ['ISSUER', 'INVOICE_SERIES', 'PRODUCT_TAX_PROFILE', 'KDP_POLICY'] } }) }));
  });

  it('shows the persisted fiscal configuration form instead of demo rules', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre legal/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tratamiento contable/)).toHaveValue('NET_ROYALTY_ONLY');
    expect(screen.queryByText(/versionadas/)).not.toBeInTheDocument();
  });

  it('still shows the real available roles', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('(ADMIN)')).toBeInTheDocument();
  });
});
