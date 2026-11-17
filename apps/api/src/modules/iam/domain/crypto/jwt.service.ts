import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string;
  tenant_id: string;
  session_id: string;
  email: string;
  mfa_verified?: boolean;
  exp: number;
  iat: number;
  [key: string]: unknown;
}

export function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function base64UrlDecode(input: string): Buffer {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

export class JwtSigner {
  static sign(payload: Record<string, unknown>, secret: string, expiresInSeconds = 900): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

    const content = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', secret).update(content).digest();
    const encodedSignature = base64UrlEncode(signature);

    return `${content}.${encodedSignature}`;
  }

  static verify<T = JwtPayload>(token: string, secret: string): T {
    if (!token) {
      throw new Error('Token is missing');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed token');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const content = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = createHmac('sha256', secret).update(content).digest();
    const providedSignature = base64UrlDecode(encodedSignature);

    if (
      expectedSignature.length !== providedSignature.length ||
      !timingSafeEqual(expectedSignature, providedSignature)
    ) {
      throw new Error('Invalid signature');
    }

    const payloadJson = base64UrlDecode(encodedPayload).toString('utf8');
    const payload = JSON.parse(payloadJson) as T & { exp?: number };

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      throw new Error('Token has expired');
    }

    return payload;
  }

  static decode<T = JwtPayload>(token: string): T | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const payloadJson = base64UrlDecode(parts[1]).toString('utf8');
      return JSON.parse(payloadJson) as T;
    } catch {
      return null;
    }
  }
}

