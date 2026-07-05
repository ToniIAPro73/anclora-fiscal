import { describe, expect, it } from 'vitest';
import { can } from '../src/index';

describe('RBAC', () => {
  it('permite todas las acciones al administrador', () => {
    expect(can('ADMIN', 'periods:close')).toBe(true);
  });

  it('impide emitir documentos al perfil de asesoría', () => {
    expect(can('ADVISOR_READONLY', 'documents:issue')).toBe(false);
    expect(can('ADVISOR_READONLY', 'documents:read')).toBe(true);
  });

  it('conserva los permisos originales de FISCAL_OPERATOR', () => {
    expect(can('FISCAL_OPERATOR', 'imports:write')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'operations:write')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'documents:issue')).toBe(true);
  });

  it('conserva los permisos originales de REVIEWER', () => {
    expect(can('REVIEWER', 'operations:review')).toBe(true);
    expect(can('REVIEWER', 'periods:close')).toBe(true);
    expect(can('REVIEWER', 'documents:rectify')).toBe(true);
  });

  it('otorga los nuevos permisos de lectura/escritura a FISCAL_OPERATOR', () => {
    expect(can('FISCAL_OPERATOR', 'operations:read')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'events:read')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'reconciliation:read')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'reconciliation:write')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'issues:read')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'documents:read')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'periods:read')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'dossier:read')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'settings:read')).toBe(true);
    expect(can('FISCAL_OPERATOR', 'settings:write')).toBe(true);
  });

  it('otorga los nuevos permisos de lectura/escritura a REVIEWER', () => {
    expect(can('REVIEWER', 'operations:read')).toBe(true);
    expect(can('REVIEWER', 'events:read')).toBe(true);
    expect(can('REVIEWER', 'reconciliation:read')).toBe(true);
    expect(can('REVIEWER', 'issues:read')).toBe(true);
    expect(can('REVIEWER', 'issues:write')).toBe(true);
    expect(can('REVIEWER', 'periods:read')).toBe(true);
    expect(can('REVIEWER', 'documents:read')).toBe(true);
    expect(can('REVIEWER', 'dossier:read')).toBe(true);
    expect(can('REVIEWER', 'dossier:write')).toBe(true);
  });

  it('ADVISOR_READONLY sigue teniendo acceso a cualquier lectura vía comodín', () => {
    expect(can('ADVISOR_READONLY', 'operations:read')).toBe(true);
    expect(can('ADVISOR_READONLY', 'events:read')).toBe(true);
    expect(can('ADVISOR_READONLY', 'reconciliation:read')).toBe(true);
    expect(can('ADVISOR_READONLY', 'issues:read')).toBe(true);
    expect(can('ADVISOR_READONLY', 'periods:read')).toBe(true);
    expect(can('ADVISOR_READONLY', 'dossier:read')).toBe(true);
  });
});
