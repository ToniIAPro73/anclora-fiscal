import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OperationsTimeline } from './timeline';

describe('OperationsTimeline', () => {
  it('renders the AI-1001 demo case with net = 0.00 EUR', () => {
    render(<OperationsTimeline />);
    expect(screen.getAllByText('0.00 EUR').length).toBeGreaterThan(0);
  });

  it('renders a status badge for the matching result', () => {
    render(<OperationsTimeline />);
    expect(screen.getByText('Pendiente de revisión fiscal')).toBeInTheDocument();
    expect(screen.getByText('Conciliado')).toBeInTheDocument();
  });

  it('shows the net-zero confirmation message', () => {
    render(<OperationsTimeline />);
    expect(screen.getByText(/neto cero confirmado/i)).toBeInTheDocument();
  });
});
