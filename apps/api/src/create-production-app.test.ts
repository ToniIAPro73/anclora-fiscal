import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class GenericRepository {
    constructor() {}
  }

  class DrizzleVatDossiersRepository {
    readonly kind = 'vat-dossiers';
    constructor(readonly db: unknown) {}
  }

  class DrizzleVerifactuSubmissionsRepository {
    readonly kind = 'verifactu-submissions';
    constructor(readonly db: unknown) {}
  }

  const closeDatabase = vi.fn().mockResolvedValue(undefined);
  const fakeApp = {
    addHook: vi.fn(),
  };

  return {
    GenericRepository,
    DrizzleVatDossiersRepository,
    DrizzleVerifactuSubmissionsRepository,
    closeDatabase,
    fakeDb: { id: 'db' },
    fakeApp,
    buildApp: vi.fn().mockResolvedValue(fakeApp),
    createRemoteDatabase: vi.fn(),
    createOfflineDatabase: vi.fn(),
    migrateOfflineDatabase: vi.fn(),
    ensureDevelopmentTenant: vi.fn(),
  };
});

vi.mock('@anclora/db', () => ({
  createRemoteDatabase: mocks.createRemoteDatabase,
  createOfflineDatabase: mocks.createOfflineDatabase,
  ensureDevelopmentTenant: mocks.ensureDevelopmentTenant,
  migrateOfflineDatabase: mocks.migrateOfflineDatabase,
  DrizzleAuthAuditRepository: mocks.GenericRepository,
  DrizzleCommercialOrdersRepository: mocks.GenericRepository,
  DrizzleDashboardSummaryRepository: mocks.GenericRepository,
  DrizzleFinancialEventsRepository: mocks.GenericRepository,
  DrizzleFiscalConfigurationRepository: mocks.GenericRepository,
  DrizzleFiscalDocumentsRepository: mocks.GenericRepository,
  DrizzleImportPreviewRepository: mocks.GenericRepository,
  DrizzleIssuesRepository: mocks.GenericRepository,
  DrizzleLegalEntitiesRepository: mocks.GenericRepository,
  DrizzleOperationsRepository: mocks.GenericRepository,
  DrizzlePeriodClosesRepository: mocks.GenericRepository,
  DrizzleReconciliationRepository: mocks.GenericRepository,
  DrizzleRoyaltyRepository: mocks.GenericRepository,
  DrizzleShopifyEvidenceLinksRepository: mocks.GenericRepository,
  DrizzleShopifyOrderPaymentEventsRepository: mocks.GenericRepository,
  DrizzleShopifyPaymentsLedgerRepository: mocks.GenericRepository,
  DrizzleShopifySalesRepository: mocks.GenericRepository,
  DrizzleSifEventsRepository: mocks.GenericRepository,
  DrizzleTaxDecisionsRepository: mocks.GenericRepository,
  DrizzleVatDossiersRepository: mocks.DrizzleVatDossiersRepository,
  DrizzleVerifactuSubmissionsRepository: mocks.DrizzleVerifactuSubmissionsRepository,
}));

vi.mock('./build-app.js', () => ({
  buildApp: mocks.buildApp,
}));

const envKeys = [
  'NODE_ENV',
  'SESSION_SECRET',
  'IMPORT_METADATA_SECRET',
  'DATABASE_URL',
  'BLOB_READ_WRITE_TOKEN',
  'BLOB_STORE_ID',
  'STORAGE_ROOT',
  'AUTH_IDENTITIES_JSON',
] as const;

const previousEnv = new Map<string, string | undefined>(
  envKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  for (const key of envKeys) {
    const value = previousEnv.get(key);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  mocks.createRemoteDatabase.mockReset();
  mocks.createOfflineDatabase.mockReset();
  mocks.migrateOfflineDatabase.mockReset();
  mocks.ensureDevelopmentTenant.mockReset();
  mocks.closeDatabase.mockReset();
  mocks.fakeApp.addHook.mockReset();
  mocks.buildApp.mockReset();
  mocks.buildApp.mockResolvedValue(mocks.fakeApp);
});

describe('createProductionApp', () => {
  it('inyecta repositorios reales de expediente IVA y read model VERI*FACTU en composición remota', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.DATABASE_URL = 'postgres://example.test/anclora';
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;

    mocks.createRemoteDatabase.mockReturnValue({
      db: mocks.fakeDb,
      close: mocks.closeDatabase,
    });

    const { createProductionApp } = await import('./create-production-app');

    const app = await createProductionApp();

    expect(app).toBe(mocks.fakeApp);
    expect(mocks.createRemoteDatabase).toHaveBeenCalledWith('postgres://example.test/anclora');
    expect(mocks.buildApp).toHaveBeenCalledOnce();

    const options = mocks.buildApp.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(options.vatDossiersRepository).toBeInstanceOf(mocks.DrizzleVatDossiersRepository);
    expect(options.verifactuSubmissionsRepository).toBeInstanceOf(mocks.DrizzleVerifactuSubmissionsRepository);
    expect(options.fiscalDocumentsRepository).toBeDefined();
    expect(options.periodClosesRepository).toBeDefined();
    expect(options.authService).toBeDefined();

    expect(mocks.fakeApp.addHook).toHaveBeenCalledWith('onClose', mocks.closeDatabase);
  });
});
