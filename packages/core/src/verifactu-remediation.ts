export type RemediationAction = 'REVIEW_DATA'|'CREATE_RECTIFYING_R5'|'CREATE_REPLACEMENT_F3'|'CREATE_ANNULMENT'|'RETRY_TECHNICAL'|'MANUAL_ADVISOR_REVIEW';
export interface RemediationDiagnosis { catalogVersion: string; source: string; code: string; description: string; diagnosis: string; action: RemediationAction; requirements: string[]; retryable: boolean }
const VERSION = '2026-07-12.v1';
export function diagnoseVerifactuFailure(input: { status: string; code?: string; documentType?: string }): RemediationDiagnosis {
  const code = input.code ?? 'UNKNOWN';
  const base = { catalogVersion: VERSION, source: 'Anclora internal remediation catalog; validate against current AEAT specifications', code };
  if (input.status === 'TECHNICAL_ERROR' || code.startsWith('TECH_')) return { ...base, description: 'Error técnico redactado', diagnosis: 'Fallo transitorio de transporte o servicio', action: 'RETRY_TECHNICAL', requirements: ['Mantener inmutable el registro original','Respetar cadencia de reintento'], retryable: true };
  if (code.includes('RECTIF') || input.documentType === 'RECTIFICATIVA') return { ...base, description: 'Corrección mediante documento posterior', diagnosis: 'El original no debe editarse', action: 'CREATE_RECTIFYING_R5', requirements: ['Crear documento nuevo','Referenciar factura original'], retryable: false };
  if (code.includes('REPLACE') || code.includes('F3')) return { ...base, description: 'Sustitución de simplificada', diagnosis: 'Puede requerir factura completa sustitutiva', action: 'CREATE_REPLACEMENT_F3', requirements: ['Simplificada original existente','Contraparte completa'], retryable: false };
  if (input.status === 'REJECTED' || input.status === 'ACCEPTED_WITH_ERRORS') return { ...base, description: 'Respuesta funcional que requiere revisión', diagnosis: 'No se reintenta automáticamente', action: 'REVIEW_DATA', requirements: ['Revisar respuesta redactada','Conservar evidencia e historial'], retryable: false };
  return { ...base, description: 'Caso no catalogado', diagnosis: 'Revisión manual necesaria', action: 'MANUAL_ADVISOR_REVIEW', requirements: ['Validación humana'], retryable: false };
}
