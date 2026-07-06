import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReconciliationPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/reconciliation' }));

describe('ReconciliationPage', () => {
  it('renders the page heading inside the AppShell', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    render(<ReconciliationPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Cobros y liquidación Shopify' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
