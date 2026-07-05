import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders eyebrow, title and description', () => {
    render(<PageHeader eyebrow="01 / EVIDENCIA" title="Bandeja de importaciones" description="Detecta y valida evidencia." />);
    expect(screen.getByText('01 / EVIDENCIA')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bandeja de importaciones' })).toBeInTheDocument();
    expect(screen.getByText('Detecta y valida evidencia.')).toBeInTheDocument();
  });

  it('renders a back link when backHref is provided', () => {
    render(<PageHeader eyebrow="01" title="Importaciones" backHref="/" />);
    expect(screen.getByRole('link', { name: 'Volver al centro de control' })).toHaveAttribute('href', '/');
  });

  it('omits the back link when backHref is absent', () => {
    render(<PageHeader eyebrow="01" title="Importaciones" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
