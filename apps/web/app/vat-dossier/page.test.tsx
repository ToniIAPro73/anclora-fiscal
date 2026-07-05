import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

describe('VatDossierLegacyPage', () => {
  it('redirects to /tax-periods', async () => {
    const { default: VatDossierLegacyPage } = await import('./page');
    VatDossierLegacyPage();
    expect(redirectMock).toHaveBeenCalledWith('/tax-periods');
  });
});
