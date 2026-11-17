import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recomendado para GCM
const DEFAULT_FALLBACK_KEY = 'transport-platform-secure-default-encryption-key-for-mfa-32b';

function resolveKey(customKey?: string): Buffer {
  const rawKey = customKey ?? process.env.AUTH_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? DEFAULT_FALLBACK_KEY;
  // Deriva sempre uma chave de exatamente 32 bytes (256 bits)
  return createHash('sha256').update(rawKey).digest();
}

export class SecretCipher {
  static encrypt(plainText: string, customKey?: string): string {
    if (!plainText) {
      throw new Error('Plain text cannot be empty');
    }

    const key = resolveKey(customKey);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Formato: iv_hex:auth_tag_hex:cipher_hex
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  static decrypt(cipherPayload: string, customKey?: string): string {
    if (!cipherPayload) {
      throw new Error('Cipher payload cannot be empty');
    }

    const parts = cipherPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid cipher payload format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = resolveKey(customKey);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}

