import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImportUploader } from './uploader';

function selectPlatform(value: string) {
  fireEvent.change(screen.getByLabelText('Plataforma'), {
    target: { value },
  });
}

function selectImportKind(value: string) {
  fireEvent.change(screen.getByLabelText('Tipo de importación'), {
    target: { value },
  });
}

describe('ImportUploader', () => {
  it('renders platform and import type selectors with a disabled placeholder card initially', () => {
    render(<ImportUploader />);

    expect(screen.getByLabelText('Plataforma')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de importación')).toBeDisabled();

    expect(
      screen.getByRole('article', { name: 'Importación pendiente de selección' }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Generar vista previa' }),
    ).toBeDisabled();

    expect(screen.queryByRole('article', { name: 'Shopify — Pedidos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Amazon KDP — Regalías' })).not.toBeInTheDocument();
  });

  it('enables only Shopify import types and renders a single selected card', () => {
    render(<ImportUploader />);

    selectPlatform('shopify');

    expect(screen.getByLabelText('Tipo de importación')).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Pedidos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Transacciones de pedido' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Payments — Movimientos y liquidación' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Regalías' })).not.toBeInTheDocument();

    selectImportKind('shopify-orders');

    expect(screen.getByRole('article', { name: 'Shopify — Pedidos' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Shopify — Transacciones de pedido' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Shopify Payments — Movimientos y liquidación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Amazon KDP — Regalías' })).not.toBeInTheDocument();
  });

  it('enables only Amazon KDP import types and renders the KDP card', () => {
    render(<ImportUploader />);

    selectPlatform('amazon-kdp');

    expect(screen.getByLabelText('Tipo de importación')).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Regalías' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Pedidos' })).not.toBeInTheDocument();

    selectImportKind('amazon-kdp-royalties');

    expect(screen.getByRole('article', { name: 'Amazon KDP — Regalías' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Shopify — Pedidos' })).not.toBeInTheDocument();
  });

  it('resets the selected import type when the platform changes', () => {
    render(<ImportUploader />);

    selectPlatform('shopify');
    selectImportKind('shopify-orders');

    expect(screen.getByRole('article', { name: 'Shopify — Pedidos' })).toBeInTheDocument();

    selectPlatform('amazon-kdp');

    expect(screen.queryByRole('article', { name: 'Shopify — Pedidos' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Importación pendiente de selección' }),
    ).toBeInTheDocument();

    const typeSelect = screen.getByLabelText('Tipo de importación') as HTMLSelectElement;
    expect(typeSelect.value).toBe('');
    expect(screen.getByRole('option', { name: 'Regalías' })).toBeInTheDocument();
  });
});
