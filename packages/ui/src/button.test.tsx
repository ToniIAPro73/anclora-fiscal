import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders as a button with default type and variant class', () => {
    render(<Button>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('btn-primary');
  });

  it('applies the requested variant', () => {
    render(<Button variant="ghost">Cancelar</Button>);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('btn-ghost');
  });

  it('calls onClick when activated', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enviar</Button>);
    screen.getByRole('button', { name: 'Enviar' }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects disabled state', () => {
    render(<Button disabled>Bloqueado</Button>);
    expect(screen.getByRole('button', { name: 'Bloqueado' })).toBeDisabled();
  });
});
