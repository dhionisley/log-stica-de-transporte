import { createHmac, createHash, randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(base32: string): Buffer {
  const cleanInput = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (val === -1) {
      throw new Error(`Invalid Base32 character: ${cleanInput[i]}`);
    }

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export class TotpEngine {
  static readonly STEP_SECONDS = 30;
  static readonly DIGITS = 6;

  static generateSecret(byteLength = 20): string {
    const bytes = randomBytes(byteLength);
    return base32Encode(bytes);
  }

  static generateCode(secretBase32: string, timestampMs: number = Date.now()): string {
    const key = base32Decode(secretBase32);
    const counter = Math.floor(timestampMs / 1000 / this.STEP_SECONDS);

    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    const hmac = createHmac('sha1', key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;

    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 10 ** this.DIGITS;
    return otp.toString().padStart(this.DIGITS, '0');
  }

  static verifyCode(
    secretBase32: string,
    code: string,
    timestampMs: number = Date.now(),
    toleranceSteps = 1,
  ): boolean {
    if (!code || code.length !== this.DIGITS) {
      return false;
    }

    const currentCounter = Math.floor(timestampMs / 1000 / this.STEP_SECONDS);

    for (let i = -toleranceSteps; i <= toleranceSteps; i++) {
      const stepTimeMs = (currentCounter + i) * this.STEP_SECONDS * 1000;
      const expectedCode = this.generateCode(secretBase32, stepTimeMs);
      if (expectedCode === code) {
        return true;
      }
    }

    return false;
  }

  static generateBackupCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const plain = randomBytes(4).toString('hex').toUpperCase(); // 8 caracteres hex
      plainCodes.push(plain);
      const hash = createHash('sha256').update(plain).digest('hex');
      hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
  }

  static verifyAndConsumeBackupCode(
    plainCode: string,
    hashedCodes: string[],
  ): { valid: boolean; remainingHashedCodes: string[] } {
    const hashToTest = createHash('sha256').update(plainCode.trim().toUpperCase()).digest('hex');
    const index = hashedCodes.indexOf(hashToTest);

    if (index === -1) {
      return { valid: false, remainingHashedCodes: hashedCodes };
    }

    const remaining = [...hashedCodes];
    remaining.splice(index, 1);
    return { valid: true, remainingHashedCodes: remaining };
  }
}

