const CONTROL_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function normalizeSpanishTaxId(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidSpanishNifNie(value: string): boolean {
  const normalized = normalizeSpanishTaxId(value);
  const nifMatch = /^(\d{8})([A-Z])$/.exec(normalized);
  const nieMatch = /^([XYZ])(\d{7})([A-Z])$/.exec(normalized);

  if (nifMatch) {
    const [, digits, letter] = nifMatch;
    return CONTROL_LETTERS[Number(digits) % 23] === letter;
  }

  if (nieMatch) {
    const [, prefix, digits, letter] = nieMatch;
    const prefixDigit = { X: '0', Y: '1', Z: '2' }[prefix as 'X' | 'Y' | 'Z'];
    return CONTROL_LETTERS[Number(`${prefixDigit}${digits}`) % 23] === letter;
  }

  return false;
}
