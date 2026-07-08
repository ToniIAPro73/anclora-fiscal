import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const VERSION_CIFRADO = 'v1';

function obtenerSecretoCifrado(): string {
  const secreto =
    process.env.IMPORT_METADATA_SECRET
    ?? 'development-only-import-metadata-secret';

  if (secreto.length < 32) {
    throw new Error(
      'IMPORT_METADATA_SECRET debe contener al menos 32 caracteres',
    );
  }

  return secreto;
}

function obtenerClaveCifrado(): Buffer {
  return createHash('sha256')
    .update(
      `fiscal-tax-identity:${obtenerSecretoCifrado()}`,
    )
    .digest();
}

/**
 * Cifra una identidad fiscal para persistirla en base de datos.
 *
 * El formato se mantiene compatible con el cifrado existente:
 * v1:<iv-base64url>:<auth-tag-base64url>:<contenido-base64url>
 */
export function encryptTaxIdentity(value: string): string {
  if (!value.trim()) {
    throw new Error(
      'La identidad fiscal no puede estar vacía',
    );
  }

  const iv = randomBytes(12);

  const cipher = createCipheriv(
    'aes-256-gcm',
    obtenerClaveCifrado(),
    iv,
  );

  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);

  return [
    VERSION_CIFRADO,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

/**
 * Descifra una identidad fiscal previamente cifrada por encryptTaxIdentity().
 *
 * No devuelve el valor cifrado ni intenta recuperarlo si el formato, la clave
 * o la etiqueta de autenticación no son válidos.
 */
export function decryptTaxIdentity(
  encryptedValue: string,
): string {
  const parts = encryptedValue.split(':');

  if (
    parts.length !== 4
    || parts[0] !== VERSION_CIFRADO
    || !parts[1]
    || !parts[2]
    || !parts[3]
  ) {
    throw new Error(
      'Formato de identidad fiscal cifrada no válido',
    );
  }

  const [, encodedIv, encodedAuthTag, encodedContent] = parts;

  try {
    const iv = Buffer.from(encodedIv, 'base64url');
    const authTag = Buffer.from(
      encodedAuthTag,
      'base64url',
    );
    const content = Buffer.from(
      encodedContent,
      'base64url',
    );

    if (
      iv.length !== 12
      || authTag.length !== 16
      || content.length === 0
    ) {
      throw new Error('Contenido cifrado no válido');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      obtenerClaveCifrado(),
      iv,
    );

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(content),
      decipher.final(),
    ]).toString('utf8');

    if (!decrypted.trim()) {
      throw new Error('Contenido descifrado vacío');
    }

    return decrypted;
  } catch {
    throw new Error(
      'No se pudo descifrar la identidad fiscal',
    );
  }
}