import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RegistersPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/registers' }));

describe('RegistersPage', () => {
  it('renders an honest empty state instead of fabricated register data', () => {
    render(<RegistersPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Registros' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Próximamente' })).toBeInTheDocument();
  });
});
