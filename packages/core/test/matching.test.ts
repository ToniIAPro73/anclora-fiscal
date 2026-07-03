import { describe, expect, it } from 'vitest';
import { matchOrder } from '../src/matching';

describe('matching AI-1001', () => {
  it('enlaza charge y refund, conserva bruto/fee y detecta neto cero', () => {
    const operation = matchOrder(
      { orderId: 'AI-1001', checkoutId: '#68683485610367', quantityIssue: true },
      [
        { id: 'charge-1', orderId: 'AI-1001', checkoutId: '#68683485610367', type: 'charge', amount: 6.99, fee: 0.45, net: 6.54, currency: 'EUR' },
        { id: 'refund-1', orderId: 'AI-1001', checkoutId: '#68683485610367', type: 'refund', amount: -6.99, fee: 0, net: -6.99, currency: 'EUR' },
      ],
    );
    expect(operation.matches).toHaveLength(2);
    expect(operation.matches.every((match) => match.confidence === 1)).toBe(true);
    expect(operation).toMatchObject({ grossAmount: 6.99, platformFeeAmount: 0.45, netAmount: 0, settlementAmount: -0.45, reconciliationStatus: 'MATCHED' });
    expect(operation.anomalyFlags).toContain('INCOHERENT_QUANTITY');
  });
});
