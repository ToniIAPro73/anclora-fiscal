import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettlementsKdpPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/settlements/kdp' }));

describe('SettlementsKdpPage', () => {
  it('renders an honest empty state instead of fabricated settlement data', () => {
    render(<SettlementsKdpPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Liquidaciones KDP' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Próximamente' })).toBeInTheDocument();
  });
});
