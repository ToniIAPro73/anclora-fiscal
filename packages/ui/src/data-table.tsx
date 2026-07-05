import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({ caption, columns, rows, rowKey, emptyMessage = 'Sin datos disponibles.' }: DataTableProps<T>) {
  if (rows.length === 0) return <p>{emptyMessage}</p>;
  return <table className="data-table">
    <caption className="sr-only">{caption}</caption>
    <thead>
      <tr>{columns.map((column) => <th key={column.key} scope="col">{column.header}</th>)}</tr>
    </thead>
    <tbody>
      {rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)}
    </tbody>
  </table>;
}
