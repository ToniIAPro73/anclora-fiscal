import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Sin datos todavía" description="Importa tu primera evidencia." />);
    expect(screen.getByRole('heading', { name: 'Sin datos todavía' })).toBeInTheDocument();
    expect(screen.getByText('Importa tu primera evidencia.')).toBeInTheDocument();
  });

  it('renders the optional action', () => {
    render(<EmptyState title="Sin datos" description="Nada aún" action={<a href="/imports">Importar</a>} />);
    expect(screen.getByRole('link', { name: 'Importar' })).toBeInTheDocument();
  });
});
