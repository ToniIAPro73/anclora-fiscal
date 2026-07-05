import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

describe('TaxEngineLegacyPage', () => {
  it('redirects to /tax-rules', async () => {
    const { default: TaxEngineLegacyPage } = await import('./page');
    TaxEngineLegacyPage();
    expect(redirectMock).toHaveBeenCalledWith('/tax-rules');
  });
});
