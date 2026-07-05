import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

describe('OperationsLegacyPage', () => {
  it('redirects to /sales/shopify', async () => {
    const { default: OperationsLegacyPage } = await import('./page');
    OperationsLegacyPage();
    expect(redirectMock).toHaveBeenCalledWith('/sales/shopify');
  });
});
