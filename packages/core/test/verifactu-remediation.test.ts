import { describe, expect, it } from 'vitest';
import { diagnoseVerifactuFailure } from '../src/verifactu-remediation';
describe('VERI*FACTU remediation catalog', () => {
  it('no reintenta rechazos funcionales', () => expect(diagnoseVerifactuFailure({ status: 'REJECTED', code: 'AEAT_01' })).toMatchObject({ action: 'REVIEW_DATA', retryable: false }));
  it('permite reintento técnico', () => expect(diagnoseVerifactuFailure({ status: 'TECHNICAL_ERROR', code: 'TECH_TIMEOUT' })).toMatchObject({ action: 'RETRY_TECHNICAL', retryable: true }));
  it('propone R5 creando documento posterior', () => expect(diagnoseVerifactuFailure({ status: 'REJECTED', code: 'RECTIF_REQUIRED' })).toMatchObject({ action: 'CREATE_RECTIFYING_R5', retryable: false }));
  it('propone F3 para sustitución', () => expect(diagnoseVerifactuFailure({ status: 'ACCEPTED_WITH_ERRORS', code: 'REPLACE_F3' })).toMatchObject({ action: 'CREATE_REPLACEMENT_F3', retryable: false }));
  it('no ofrece anulación sin soporte oficial', () => expect(diagnoseVerifactuFailure({ status: 'UNKNOWN' }).action).not.toBe('CREATE_ANNULMENT'));
});
