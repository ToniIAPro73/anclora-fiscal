import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CurrencyField } from './currency-field';

describe('CurrencyField', () => {
  it('renders a numeric input with the currency suffix', () => {
    render(<CurrencyField label="Importe" onChange={vi.fn()} value="" />);
    const input = screen.getByLabelText('Importe');
    expect(input).toHaveAttribute('type', 'number');
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });

  it('supports an alternate currency label', () => {
    render(<CurrencyField label="Importe" currency="USD" onChange={vi.fn()} value="" />);
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('surfaces validation errors', () => {
    render(<CurrencyField label="Importe" error="Importe inválido" onChange={vi.fn()} value="" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Importe inválido');
  });
});
