import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangeField } from './date-range-field';

describe('DateRangeField', () => {
  it('renders labeled from/to date inputs', () => {
    render(<DateRangeField label="Periodo" value={{ from: '', to: '' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Desde')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('type', 'date');
  });

  it('calls onChange with the updated range when "from" changes', () => {
    const onChange = vi.fn();
    render(<DateRangeField label="Periodo" value={{ from: '', to: '2026-01-01' }} onChange={onChange} />);
    const input = screen.getByLabelText('Desde');
    fireEvent.change(input, { target: { value: '2026-01-05' } });
    expect(onChange).toHaveBeenCalledWith({ from: '2026-01-05', to: '2026-01-01' });
  });
});
