import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SifEventsPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/sif-events' }));

describe('SifEventsPage', () => {
  it('renders the page heading inside the AppShell', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [], page: 1, pageSize: 25, total: 0 }) }));
    render(<SifEventsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Eventos SIF' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
