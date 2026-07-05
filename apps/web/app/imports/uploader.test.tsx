import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImportUploader } from './uploader';

describe('ImportUploader', () => {
  it('renders the three connector-specific cards', () => {
    render(<ImportUploader />);
    expect(screen.getByRole('article', { name: 'Shopify — Pedidos' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Shopify — Pagos y payouts' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Amazon KDP — Regalías' })).toBeInTheDocument();
  });
});
