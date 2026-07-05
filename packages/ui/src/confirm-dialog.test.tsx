import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(<ConfirmDialog open={false} title="Eliminar" description="¿Seguro?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument();
  });

  it('renders title, description and both actions when open', () => {
    render(<ConfirmDialog open title="Eliminar operación" description="Esta acción no se puede deshacer." onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Eliminar operación' })).toBeInTheDocument();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('calls onConfirm / onCancel when the respective button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Eliminar" description="¿Seguro?" onConfirm={onConfirm} onCancel={onCancel} />);
    screen.getByRole('button', { name: 'Confirmar' }).click();
    expect(onConfirm).toHaveBeenCalledOnce();
    screen.getByRole('button', { name: 'Cancelar' }).click();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
