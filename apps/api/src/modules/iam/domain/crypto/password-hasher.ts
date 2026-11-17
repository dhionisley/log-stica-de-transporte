import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  N: 16384,
  r: 8,
  p: 1,
};

const KEY_LENGTH = 64;

function deriveScrypt(password: string, salt: string, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: params.N,
        r: params.r,
        p: params.p,
        maxmem: 32 * 1024 * 1024,
      },
      (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          resolve(derivedKey);
        }
      },
    );
  });
}

export class PasswordHasher {
  static async hashPassword(
    password: string,
    params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
    customSalt?: string,
  ): Promise<{ hash: string; salt: string; params: ScryptParams }> {
    if (!password || password.length < 8) {
      throw new Error('Password must have at least 8 characters');
    }

    const salt = customSalt ?? randomBytes(16).toString('hex');
    const derivedKey = await deriveScrypt(password, salt, params);

    return {
      hash: derivedKey.toString('hex'),
      salt,
      params,
    };
  }

  static async verifyPassword(
    password: string,
    storedHash: string,
    salt: string,
    params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
  ): Promise<boolean> {
    if (!password || !storedHash || !salt) {
      return false;
    }

    try {
      const derivedKey = await deriveScrypt(password, salt, params);
      const storedBuffer = Buffer.from(storedHash, 'hex');
      if (derivedKey.length !== storedBuffer.length) {
        return false;
      }

      return timingSafeEqual(derivedKey, storedBuffer);
    } catch {
      return false;
    }
  }
}
