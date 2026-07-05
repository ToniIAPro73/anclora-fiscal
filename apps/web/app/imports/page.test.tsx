import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ImportsPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/imports' }));

describe('ImportsPage', () => {
  it('renders the page heading inside the AppShell', () => {
    render(<ImportsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bandeja de importaciones' })).toBeInTheDocument();
  });
});
