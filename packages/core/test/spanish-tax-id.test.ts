import { describe, expect, it } from 'vitest';
import { isValidSpanishNifNie, normalizeSpanishTaxId } from '../src/spanish-tax-id';

describe('Spanish NIF/NIE validation', () => {
  it('normaliza espacios, guiones y mayúsculas', () => {
    expect(normalizeSpanishTaxId(' x-1234567-l ')).toBe('X1234567L');
  });

  it('acepta NIF y NIE válidos', () => {
    expect(isValidSpanishNifNie('12345678Z')).toBe(true);
    expect(isValidSpanishNifNie('00000000T')).toBe(true);
    expect(isValidSpanishNifNie('X1234567L')).toBe(true);
    expect(isValidSpanishNifNie('Y1234567X')).toBe(true);
    expect(isValidSpanishNifNie('Z1234567R')).toBe(true);
  });

  it('rechaza formatos o letras de control inválidas', () => {
    expect(isValidSpanishNifNie('12345678A')).toBe(false);
    expect(isValidSpanishNifNie('X1234567A')).toBe(false);
    expect(isValidSpanishNifNie('B12345678')).toBe(false);
  });
});
