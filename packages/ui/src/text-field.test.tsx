import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextField } from './text-field';

describe('TextField', () => {
  it('associates the label with the input', () => {
    render(<TextField label="Nombre" onChange={vi.fn()} value="" />);
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('shows the required marker without exposing it to screen readers as text', () => {
    render(<TextField label="Email" required onChange={vi.fn()} value="" />);
    const input = screen.getByLabelText(/Email/);
    expect(input).toBeRequired();
  });

  it('wires an error message via aria-describedby', () => {
    render(<TextField label="Importe" error="Campo obligatorio" onChange={vi.fn()} value="" />);
    const input = screen.getByLabelText('Importe');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Campo obligatorio');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });
});
