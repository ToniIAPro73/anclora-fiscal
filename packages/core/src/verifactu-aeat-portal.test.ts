import { describe, expect, it } from 'vitest';
import { resolveAeatVerifactuPortalReadiness } from './verifactu-aeat-portal';

describe('resolveAeatVerifactuPortalReadiness', () => {
  it('marca como listo el portal de pruebas con endpoint de preproducción y certificado configurado', () => {
    const readiness = resolveAeatVerifactuPortalReadiness({
      environment: 'test',
      endpointUrl: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion',
      certificatePath: '/secrets/aeat-test.p12',
      certificatePasswordConfigured: true,
      certificateFingerprint: 'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd',
    });

    expect(readiness).toMatchObject({
      environment: 'test',
      endpointHost: 'prewww10.aeat.es',
      preproductionHost: true,
      certificateConfigured: true,
      certificateFingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
      productionSubmissionEnabled: false,
      allowAutomatedLoadTests: false,
      ready: true,
      blockedReasons: [],
      warnings: [],
      usagePolicy: 'manual-preproduction-tests-only',
    });
  });

  it('bloquea endpoint inseguro o certificado incompleto', () => {
    const readiness = resolveAeatVerifactuPortalReadiness({
      environment: 'test',
      endpointUrl: 'http://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion',
      certificateFingerprint: 'not-a-fingerprint',
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockedReasons).toEqual(expect.arrayContaining([
      'AEAT_VERIFACTU_ENDPOINT_REQUIRES_HTTPS',
      'AEAT_VERIFACTU_CERTIFICATE_PATH_REQUIRED',
      'AEAT_VERIFACTU_CERTIFICATE_PASSWORD_REQUIRED',
      'AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_INVALID',
      'AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_REQUIRED',
    ]));
  });

  it('bloquea pruebas masivas en preproducción', () => {
    const readiness = resolveAeatVerifactuPortalReadiness({
      environment: 'test',
      endpointUrl: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion',
      certificatePath: '/secrets/aeat-test.p12',
      certificatePasswordConfigured: true,
      certificateFingerprint: 'a'.repeat(40),
      allowAutomatedLoadTests: true,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockedReasons).toContain('AEAT_VERIFACTU_PREPRODUCTION_LOAD_TESTS_NOT_ALLOWED');
  });

  it('advierte si el entorno test no apunta a un host reconocido de preproducción', () => {
    const readiness = resolveAeatVerifactuPortalReadiness({
      environment: 'test',
      endpointUrl: 'https://example.com/verifactu',
      certificatePath: '/secrets/aeat-test.p12',
      certificatePasswordConfigured: true,
      certificateFingerprint: 'b'.repeat(64),
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.preproductionHost).toBe(false);
    expect(readiness.warnings).toContain('AEAT_VERIFACTU_TEST_ENDPOINT_NOT_RECOGNIZED_AS_PREPRODUCTION');
  });

  it('bloquea producción salvo habilitación explícita', () => {
    const readiness = resolveAeatVerifactuPortalReadiness({
      environment: 'production',
      endpointUrl: 'https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion',
      certificatePath: '/secrets/aeat-production.p12',
      certificatePasswordConfigured: true,
      certificateFingerprint: 'c'.repeat(64),
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockedReasons).toContain('AEAT_VERIFACTU_PRODUCTION_SUBMISSION_NOT_ENABLED');
  });

  it('bloquea producción si apunta por error a preproducción', () => {
    const readiness = resolveAeatVerifactuPortalReadiness({
      environment: 'production',
      endpointUrl: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion',
      certificatePath: '/secrets/aeat-production.p12',
      certificatePasswordConfigured: true,
      certificateFingerprint: 'd'.repeat(64),
      productionSubmissionEnabled: true,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockedReasons).toContain('AEAT_VERIFACTU_PRODUCTION_ENDPOINT_POINTS_TO_PREPRODUCTION');
  });
});
