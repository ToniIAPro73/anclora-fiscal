import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';

interface Row { id: string; name: string }

const rows: Row[] = [{ id: '1', name: 'Fila uno' }, { id: '2', name: 'Fila dos' }];
const columns = [{ key: 'name', header: 'Nombre', render: (row: Row) => row.name }];

describe('DataTable', () => {
  it('renders rows with the provided columns', () => {
    render(<DataTable caption="Operaciones" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Fila uno')).toBeInTheDocument();
    expect(screen.getByText('Fila dos')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
  });

  it('shows the empty message when there are no rows', () => {
    render(<DataTable caption="Operaciones" columns={columns} rows={[]} rowKey={(row) => row.id} emptyMessage="No hay operaciones todavía." />);
    expect(screen.getByText('No hay operaciones todavía.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
