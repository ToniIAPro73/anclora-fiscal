import type {
  VerifactuSubmissionExecutable,
  VerifactuSubmissionExecutionRepositoryPort,
  VerifactuSubmissionExecutionService,
} from '@anclora/core/server';

export interface VerifactuDueRepositoryPort
  extends VerifactuSubmissionExecutionRepositoryPort {
  releaseExpiredClaims(input: { now: string }): Promise<number>;
  claimDueBatch(input: {
    now: string;
    limit: number;
    workerId: string;
    leaseMs: number;
  }): Promise<VerifactuSubmissionExecutable[]>;
}

export interface VerifactuDueProcessingSummary {
  claimed: number;
  accepted: number;
  acceptedWithErrors: number;
  rejected: number;
  retryScheduled: number;
  skipped: number;
  failures: number;
}

export async function processDueVerifactuSubmissions(input: {
  repository: VerifactuDueRepositoryPort;
  service: VerifactuSubmissionExecutionService;
  now: string;
  workerId: string;
  batchSize: number;
  leaseMs: number;
  onOutcome?: (event: { tenantId: string; submissionId: string; status: string }) => Promise<void>;
}): Promise<VerifactuDueProcessingSummary> {
  await input.repository.releaseExpiredClaims({ now: input.now });
  const claimed = await input.repository.claimDueBatch({
    now: input.now,
    limit: input.batchSize,
    workerId: input.workerId,
    leaseMs: input.leaseMs,
  });
  const summary: VerifactuDueProcessingSummary = {
    claimed: claimed.length,
    accepted: 0,
    acceptedWithErrors: 0,
    rejected: 0,
    retryScheduled: 0,
    skipped: 0,
    failures: 0,
  };

  for (const submission of claimed) {
    try {
      const result = await input.service.submitPending({
        tenantId: submission.tenantId,
        submissionId: submission.id,
      });
      if (!result.ok) {
        summary.skipped += 1;
        continue;
      }
      await input.onOutcome?.({ tenantId: submission.tenantId, submissionId: submission.id, status: result.outcome.status });
      if (result.outcome.status === 'ACCEPTED') summary.accepted += 1;
      else if (result.outcome.status === 'ACCEPTED_WITH_ERRORS') summary.acceptedWithErrors += 1;
      else if (result.outcome.status === 'REJECTED') summary.rejected += 1;
      else if (result.outcome.status === 'RETRY_SCHEDULED') summary.retryScheduled += 1;
      else summary.failures += 1;
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
