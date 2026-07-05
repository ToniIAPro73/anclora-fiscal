import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VerifactuPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/verifactu' }));

describe('VerifactuPage', () => {
  it('renders a preparation-only body with no send action', () => {
    render(<VerifactuPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'VERI*FACTU' })).toBeInTheDocument();
    expect(screen.getByText('Sin datos disponibles')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /emitir|enviar/i })).not.toBeInTheDocument();
  });
});
