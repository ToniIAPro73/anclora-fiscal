import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/settings' }));

describe('SettingsPage', () => {
  it('shows an honest empty state instead of the demo fiscal config', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay configuración fiscal editable')).toBeInTheDocument();
    expect(screen.queryByText(/versionadas/)).not.toBeInTheDocument();
  });

  it('still shows the real available roles', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('(ADMIN)')).toBeInTheDocument();
  });
});
