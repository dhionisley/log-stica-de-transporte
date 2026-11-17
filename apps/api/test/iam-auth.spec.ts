import { PasswordHasher } from '../src/modules/iam/domain/crypto/password-hasher';
import { SecretCipher } from '../src/modules/iam/domain/crypto/secret-cipher';
import { TotpEngine } from '../src/modules/iam/domain/crypto/totp';
import { JwtSigner } from '../src/modules/iam/domain/crypto/jwt.service';
import { UserCredentials } from '../src/modules/iam/domain/user-credentials.entity';
import { UserSession } from '../src/modules/iam/domain/user-session.entity';
import { MfaMethod } from '../src/modules/iam/domain/mfa-method.entity';

describe('IAM Authentication & Security Domain (Unit)', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const userId = '11111111-1111-1111-1111-111111111111';

  describe('PasswordHasher', () => {
    it('hashes and verifies valid password using scrypt', async () => {
      const password = 'StrongPassword123!';
      const { hash, salt, params } = await PasswordHasher.hashPassword(password);

      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(params.N).toBe(16384);

      const isValid = await PasswordHasher.verifyPassword(password, hash, salt, params);
      expect(isValid).toBe(true);

      const isInvalid = await PasswordHasher.verifyPassword('WrongPassword123!', hash, salt, params);
      expect(isInvalid).toBe(false);
    });

    it('rejects passwords shorter than 8 characters', async () => {
      await expect(PasswordHasher.hashPassword('short')).rejects.toThrow(
        'Password must have at least 8 characters',
      );
    });
  });

  describe('SecretCipher (AES-256-GCM)', () => {
    it('encrypts and decrypts secret payload consistently', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = SecretCipher.encrypt(secret);

      expect(encrypted).toContain(':');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3); // iv:tag:cipher

      const decrypted = SecretCipher.decrypt(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('throws error when cipher text is tampered', () => {
      const encrypted = SecretCipher.encrypt('my-secret');
      const parts = encrypted.split(':');
      const tampered = `${parts[0]}:${parts[1]}:deadbeef`;

      expect(() => SecretCipher.decrypt(tampered)).toThrow();
    });
  });

  describe('TotpEngine (RFC 6238)', () => {
    it('generates Base32 secret and valid 6-digit TOTP code', () => {
      const secret = TotpEngine.generateSecret(20);
      expect(secret).toMatch(/^[A-Z2-7]+$/);

      const now = Date.now();
      const code = TotpEngine.generateCode(secret, now);
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);

      const validCurrent = TotpEngine.verifyCode(secret, code, now, 1);
      expect(validCurrent).toBe(true);

      // Janela de tolerância (step anterior: -30s)
      const validPast = TotpEngine.verifyCode(secret, code, now + 30000, 1);
      expect(validPast).toBe(true);

      // Fora da tolerância (+120s)
      const invalidFarFuture = TotpEngine.verifyCode(secret, code, now + 120000, 1);
      expect(invalidFarFuture).toBe(false);
    });

    it('generates, verifies and consumes backup codes', () => {
      const { plainCodes, hashedCodes } = TotpEngine.generateBackupCodes(5);
      expect(plainCodes).toHaveLength(5);
      expect(hashedCodes).toHaveLength(5);

      const codeToUse = plainCodes[0];
      const result = TotpEngine.verifyAndConsumeBackupCode(codeToUse, hashedCodes);

      expect(result.valid).toBe(true);
      expect(result.remainingHashedCodes).toHaveLength(4);

      // Não pode reutilizar o mesmo código
      const secondTry = TotpEngine.verifyAndConsumeBackupCode(codeToUse, result.remainingHashedCodes);
      expect(secondTry.valid).toBe(false);
      expect(secondTry.remainingHashedCodes).toHaveLength(4);
    });
  });

  describe('UserCredentials Aggregate', () => {
    it('creates credentials and locks after 5 consecutive failures', async () => {
      const { hash, salt, params } = await PasswordHasher.hashPassword('MySecurePassword1!');
      const credentials = UserCredentials.create({
        tenantId,
        userId,
        passwordHash: hash,
        passwordSalt: salt,
        params,
      });

      expect(credentials.failedAttempts).toBe(0);
      expect(credentials.isLocked()).toBe(false);

      // 4 falhas
      for (let i = 0; i < 4; i++) {
        const ok = await credentials.verifyPassword('WrongPass!');
        expect(ok).toBe(false);
        expect(credentials.isLocked()).toBe(false);
      }
      expect(credentials.failedAttempts).toBe(4);

      // 5ª falha -> bloqueio
      const ok5 = await credentials.verifyPassword('WrongPass!');
      expect(ok5).toBe(false);
      expect(credentials.failedAttempts).toBe(5);
      expect(credentials.isLocked()).toBe(true);

      // Mesmo com senha correta, recusa enquanto bloqueado
      const okLocked = await credentials.verifyPassword('MySecurePassword1!');
      expect(okLocked).toBe(false);
    });
  });

  describe('UserSession Aggregate', () => {
    it('manages lifecycle, token rotation and revocation', () => {
      const session = UserSession.create({
        tenantId,
        userId,
        refreshTokenHash: 'hash-1',
      });

      expect(session.isActive()).toBe(true);
      expect(session.revokedAt).toBeUndefined();

      session.rotateRefreshToken('hash-2');
      expect(session.refreshTokenHash).toBe('hash-2');
      expect(session.isActive()).toBe(true);

      session.revoke('USER_LOGOUT');
      expect(session.isActive()).toBe(false);
      expect(session.revokedAt).toBeDefined();
      expect(session.revocationReason).toBe('USER_LOGOUT');

      expect(() => session.rotateRefreshToken('hash-3')).toThrow(
        'Cannot rotate token on inactive or revoked session',
      );
    });
  });

  describe('MfaMethod Aggregate', () => {
    it('activates and consumes backup codes correctly', () => {
      const { plainCodes, hashedCodes } = TotpEngine.generateBackupCodes(4);
      const mfa = MfaMethod.create({
        tenantId,
        userId,
        methodType: 'BACKUP_CODES',
        backupCodes: hashedCodes,
      });

      expect(mfa.status).toBe('PENDING');
      expect(mfa.isActive()).toBe(false);

      mfa.activate();
      expect(mfa.status).toBe('ACTIVE');
      expect(mfa.isActive()).toBe(true);

      const consumed = mfa.consumeBackupCode(plainCodes[0]);
      expect(consumed).toBe(true);
      expect(mfa.backupCodes).toHaveLength(3);
    });
  });

  describe('JwtSigner', () => {
    const secret = 'super-secret-jwt-key-32-bytes-minimum';

    it('signs and verifies JWT token with claims and expiration', () => {
      const token = JwtSigner.sign(
        {
          sub: userId,
          tenant_id: tenantId,
          email: 'admin@empresa.com',
        },
        secret,
        60, // 60 segundos
      );

      expect(token).toBeDefined();
      const payload = JwtSigner.verify(token, secret);
      expect(payload.sub).toBe(userId);
      expect(payload.tenant_id).toBe(tenantId);
      expect(payload.email).toBe('admin@empresa.com');
    });

    it('rejects expired tokens', () => {
      const expiredToken = JwtSigner.sign(
        { sub: userId, tenant_id: tenantId },
        secret,
        -10, // expirado há 10 segundos
      );

      expect(() => JwtSigner.verify(expiredToken, secret)).toThrow('Token has expired');
    });

    it('rejects tokens signed with invalid secret', () => {
      const token = JwtSigner.sign({ sub: userId }, secret, 60);
      expect(() => JwtSigner.verify(token, 'different-secret')).toThrow('Invalid signature');
    });
  });
});
