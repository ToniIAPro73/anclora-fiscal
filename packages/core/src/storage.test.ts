import { afterEach, describe, expect, it, vi } from 'vitest';

const putMock = vi.fn();
const getMock = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => putMock(...args),
  get: (...args: unknown[]) => getMock(...args),
}));

const { VercelBlobStorage } = await import('./storage.js');

afterEach(() => {
  putMock.mockReset();
  getMock.mockReset();
});

describe('VercelBlobStorage', () => {
  it('escribe el objeto como privado y devuelve su clave y hash', async () => {
    putMock.mockResolvedValue({ pathname: 'tenant-1/some-key', url: 'https://blob.example/tenant-1/some-key' });
    const storage = new VercelBlobStorage();
    const bytes = new TextEncoder().encode('contenido de evidencia');

    const result = await storage.put({ tenantId: 'tenant-1', bytes, mimeType: 'text/csv' });

    expect(putMock).toHaveBeenCalledTimes(1);
    const [key, body, options] = putMock.mock.calls[0] as [string, unknown, { access: string; contentType: string }];
    expect(key.startsWith('tenant-1/')).toBe(true);
    expect(options).toEqual({ access: 'private', contentType: 'text/csv' });
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(result).toEqual({ key: 'tenant-1/some-key', sha256: expect.any(String), size: bytes.byteLength, mimeType: 'text/csv' });
  });

  it('lee el objeto reensamblando el stream en un único buffer', async () => {
    const chunks = [new TextEncoder().encode('hola '), new TextEncoder().encode('mundo')];
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: {
        getReader: () => {
          let index = 0;
          return {
            read: async () => {
              if (index < chunks.length) return { done: false, value: chunks[index++] };
              return { done: true, value: undefined };
            },
          };
        },
      },
    });
    const storage = new VercelBlobStorage();

    const bytes = await storage.get('tenant-1/some-key');

    expect(getMock).toHaveBeenCalledWith('tenant-1/some-key', { access: 'private' });
    expect(Buffer.from(bytes).toString()).toBe('hola mundo');
  });

  it('rechaza claves con segmentos de directorio ascendentes', async () => {
    const storage = new VercelBlobStorage();
    await expect(storage.get('../etc/passwd')).rejects.toThrow('Clave de almacenamiento no válida');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('lanza un error legible cuando el objeto no existe', async () => {
    getMock.mockResolvedValue(null);
    const storage = new VercelBlobStorage();
    await expect(storage.get('tenant-1/missing')).rejects.toThrow('Objeto de almacenamiento no encontrado');
  });
});
