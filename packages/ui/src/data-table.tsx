import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  minWidth?: number;
  className?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage = "Sin datos disponibles.",
  minWidth = 680,
  className,
}: DataTableProps<T>) {
  const classes = ["data-table-panel", className].filter(Boolean).join(" ");

  if (rows.length === 0) {
    return (
      <div className={classes}>
        <p className="data-table-empty">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={classes}>
      <table className="data-table" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
