import { describe, expect, it, vi } from 'vitest';
import type {
  VerifactuSubmissionExecutable,
  VerifactuSubmissionExecutionService,
} from '@anclora/core/server';
import { processDueVerifactuSubmissions } from './verifactu-due-processor';

const executable = {
  id: 'submission-1',
  tenantId: 'tenant-1',
} as VerifactuSubmissionExecutable;

describe('processDueVerifactuSubmissions', () => {
  it('reclama lote y contabiliza resultados normalizados', async () => {
    const repository = {
      releaseExpiredClaims: vi.fn().mockResolvedValue(1),
      claimDueBatch: vi.fn().mockResolvedValue([executable]),
    };
    const service = {
      submitPending: vi.fn().mockResolvedValue({
        ok: true,
        outcome: { status: 'ACCEPTED' },
      }),
    } as unknown as VerifactuSubmissionExecutionService;

    const result = await processDueVerifactuSubmissions({
      repository: repository as never,
      service,
      now: '2026-07-12T10:00:00.000Z',
      workerId: 'worker-1',
      batchSize: 10,
      leaseMs: 60_000,
    });

    expect(repository.releaseExpiredClaims).toHaveBeenCalledOnce();
    expect(repository.claimDueBatch).toHaveBeenCalledWith(expect.objectContaining({
      workerId: 'worker-1',
      limit: 10,
    }));
    expect(result).toEqual({
      claimed: 1,
      accepted: 1,
      acceptedWithErrors: 0,
      rejected: 0,
      retryScheduled: 0,
      skipped: 0,
      failures: 0,
    });
  });

  it('aísla fallos de una submission y continúa lote', async () => {
    const service = {
      submitPending: vi.fn()
        .mockRejectedValueOnce(new Error('synthetic'))
        .mockResolvedValueOnce({ ok: false, reason: 'VERIFACTU_RETRY_NOT_DUE' }),
    } as unknown as VerifactuSubmissionExecutionService;
    const result = await processDueVerifactuSubmissions({
      repository: {
        releaseExpiredClaims: vi.fn().mockResolvedValue(0),
        claimDueBatch: vi.fn().mockResolvedValue([
          executable,
          { ...executable, id: 'submission-2' },
        ]),
      } as never,
      service,
      now: '2026-07-12T10:00:00.000Z',
      workerId: 'worker-1',
      batchSize: 10,
      leaseMs: 60_000,
    });
    expect(result).toMatchObject({ claimed: 2, failures: 1, skipped: 1 });
  });
});
