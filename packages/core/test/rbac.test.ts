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
});
