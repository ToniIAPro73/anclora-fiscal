import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InvoicingPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/invoicing' }));

describe('InvoicingPage', () => {
  it('renders the page heading inside the AppShell', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    render(<InvoicingPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Facturación' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
