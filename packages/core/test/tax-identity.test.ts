import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  decryptTaxIdentity,
  encryptTaxIdentity,
} from '../src/tax-identity';

const secretoOriginal = process.env.IMPORT_METADATA_SECRET;

beforeEach(() => {
  process.env.IMPORT_METADATA_SECRET =
    'test-only-fiscal-tax-identity-secret-32-chars';
});

afterEach(() => {
  if (secretoOriginal === undefined) {
    delete process.env.IMPORT_METADATA_SECRET;
    return;
  }

  process.env.IMPORT_METADATA_SECRET = secretoOriginal;
});

describe('tax identity encryption', () => {
  it('cifra y descifra una identidad fiscal', () => {
    const taxIdentity = '12345678Z';

    const encrypted = encryptTaxIdentity(taxIdentity);

    expect(encrypted).not.toBe(taxIdentity);
    expect(encrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);

    expect(
      decryptTaxIdentity(encrypted),
    ).toBe(taxIdentity);
  });

  it('genera valores cifrados distintos para el mismo NIF/NIE', () => {
    const first = encryptTaxIdentity('12345678Z');
    const second = encryptTaxIdentity('12345678Z');

    expect(first).not.toBe(second);

    expect(decryptTaxIdentity(first)).toBe('12345678Z');
    expect(decryptTaxIdentity(second)).toBe('12345678Z');
  });

  it('rechaza contenido cifrado con formato no válido', () => {
    expect(() => {
      decryptTaxIdentity('no-es-un-valor-cifrado');
    }).toThrow(
      'Formato de identidad fiscal cifrada no válido',
    );
  });

  it('rechaza contenido cifrado alterado', () => {
    const encrypted = encryptTaxIdentity('12345678Z');

    const altered = `${encrypted}alterado`;

    expect(() => {
      decryptTaxIdentity(altered);
    }).toThrow(
      'No se pudo descifrar la identidad fiscal',
    );
  });
});