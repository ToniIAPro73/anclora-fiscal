import { describe, expect, it } from 'vitest';
import { parsePagination } from './pagination';

describe('parsePagination', () => {
  it('aplica valores por defecto cuando no se envían parámetros', () => {
    const result = parsePagination({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('rechaza pageSize mayor a 100', () => {
    expect(() => parsePagination({ pageSize: 101 })).toThrow();
  });

  it('coacciona parámetros de query en formato string (Fastify)', () => {
    const result = parsePagination({ page: '3', pageSize: '50' });
    expect(result).toEqual({ page: 3, pageSize: 50 });
  });
});
