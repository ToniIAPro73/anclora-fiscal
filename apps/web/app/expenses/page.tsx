'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';

export default function ExpensesPage() {
  const [items, setItems] = useState<Array<Record<string, string>>>([]);

  useEffect(() => {
    fetch('/api/v1/expenses', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((body: { items: Array<Record<string, string>> }) => setItems(body.items));
  }, []);

  return (
    <AppShell>
      <PageHeader
        eyebrow="GASTOS"
        title="Facturas recibidas"
        actions={
          <Link className="btn btn-primary" href="/expenses/new">
            Alta manual
          </Link>
        }
      />

      <nav aria-label="Configuración de gastos" className="expenses-settings-nav">
        <Link href="/expenses/settings/home-office">Configurar Home Office</Link>
      </nav>

      {items.length ? (
        <div className="reconciliation-table-panel">
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Categoría</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/expenses/${item.id}`}>{item.documentNumber}</Link>
                  </td>
                  <td>{item.issueDate}</td>
                  <td>{item.categoryCode}</td>
                  <td>
                    {item.totalAmount} {item.currency}
                  </td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="workbench-notice">No hay facturas recibidas.</p>
      )}
    </AppShell>
  );
}
