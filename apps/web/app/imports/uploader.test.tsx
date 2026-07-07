import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImportUploader } from './uploader';

describe('ImportUploader', () => {
  it('renders three distinct Shopify evidence cards plus KDP', () => {
    render(<ImportUploader />);
    expect(screen.getByRole('article', { name: 'Shopify — Pedidos' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Shopify — Transacciones de pedido' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Shopify Payments — Movimientos y liquidación' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Amazon KDP — Regalías' })).toBeInTheDocument();
  });
});
