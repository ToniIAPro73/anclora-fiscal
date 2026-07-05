import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from './select-field';

const options = [
  { value: 'a', label: 'Opción A' },
  { value: 'b', label: 'Opción B' },
];

describe('SelectField', () => {
  it('renders all options plus an optional placeholder', () => {
    render(<SelectField label="Canal" options={options} placeholder="Selecciona" onChange={vi.fn()} value="" />);
    const select = screen.getByLabelText('Canal');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Selecciona' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Opción A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Opción B' })).toBeInTheDocument();
  });

  it('shows an error message tied via aria-describedby', () => {
    render(<SelectField label="Canal" options={options} error="Selecciona un canal" onChange={vi.fn()} value="" />);
    expect(screen.getByLabelText('Canal')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona un canal');
  });
});
