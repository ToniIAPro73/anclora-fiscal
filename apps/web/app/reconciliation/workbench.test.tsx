import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReconciliationWorkbench } from './workbench';

describe('ReconciliationWorkbench', () => {
  it('renders 3 demo cases as table rows', () => {
    render(<ReconciliationWorkbench />);
    const rows = screen.getAllByRole('row');
    // 1 header row + 3 demo case rows
    expect(rows).toHaveLength(4);
  });

  it('renders distinct reconciliation states', () => {
    render(<ReconciliationWorkbench />);
    expect(screen.getAllByText('Conciliado')).toHaveLength(2);
    expect(screen.getByText('Excepción')).toBeInTheDocument();
  });

  it('renders each demo case label', () => {
    render(<ReconciliationWorkbench />);
    expect(screen.getByText('AI-1001 · reembolso total')).toBeInTheDocument();
    expect(screen.getByText('SP-2045 · cobro único')).toBeInTheDocument();
    expect(screen.getByText('SP-3399 · cobro sin pedido')).toBeInTheDocument();
  });
});
