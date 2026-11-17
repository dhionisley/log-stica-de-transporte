import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { MfaMethod } from '../domain/mfa-method.entity';
import { TotpEngine } from '../domain/crypto/totp';
import { SecretCipher } from '../domain/crypto/secret-cipher';
import {
  PostgresMfaMethodRepository,
  PostgresUserRepository,
} from '../infrastructure/postgres-iam.repository';

export interface SetupTotpResult {
  secretBase32: string;
  backupCodes: string[];
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly mfaRepo: PostgresMfaMethodRepository,
    private readonly userRepo: PostgresUserRepository,
  ) {}

  async setupTotp(
    client: PoolClient,
    tenantId: string,
    userId: string,
  ): Promise<SetupTotpResult> {
    const secretBase32 = TotpEngine.generateSecret(20);
    const encryptedSecret = SecretCipher.encrypt(secretBase32);

    const { plainCodes, hashedCodes } = TotpEngine.generateBackupCodes(8);

    const existing = await this.mfaRepo.findByUserAndType(client, tenantId, userId, 'TOTP');
    if (existing) {
      existing.revoke();
      await this.mfaRepo.save(client, existing);
    }

    const mfaMethod = MfaMethod.create({
      tenantId,
      userId,
      methodType: 'TOTP',
      secretEncrypted: encryptedSecret,
      backupCodes: hashedCodes,
    });

    await this.mfaRepo.save(client, mfaMethod);

    return {
      secretBase32,
      backupCodes: plainCodes,
    };
  }

  async activateTotp(
    client: PoolClient,
    tenantId: string,
    userId: string,
    code: string,
  ): Promise<boolean> {
    const mfaMethod = await this.mfaRepo.findByUserAndType(client, tenantId, userId, 'TOTP');
    if (!mfaMethod || !mfaMethod.secretEncrypted) {
      return false;
    }

    const plainSecret = SecretCipher.decrypt(mfaMethod.secretEncrypted);
    const valid = TotpEngine.verifyCode(plainSecret, code);
    if (!valid) {
      return false;
    }

    mfaMethod.activate();
    await this.mfaRepo.save(client, mfaMethod);

    const user = await this.userRepo.findById(client, tenantId, userId);
    if (user) {
      user.setMfaRequired(true);
      await this.userRepo.save(client, user);
    }

    return true;
  }

  async verifyMfaChallenge(
    client: PoolClient,
    tenantId: string,
    userId: string,
    codeOrBackupCode: string,
  ): Promise<boolean> {
    const mfaMethod = await this.mfaRepo.findByUserAndType(client, tenantId, userId, 'TOTP');
    if (!mfaMethod || !mfaMethod.isActive() || !mfaMethod.secretEncrypted) {
      return false;
    }

    const cleanInput = codeOrBackupCode.trim();

    // 1. Tenta validar como código TOTP (6 dígitos)
    if (/^\d{6}$/.test(cleanInput)) {
      const plainSecret = SecretCipher.decrypt(mfaMethod.secretEncrypted);
      const valid = TotpEngine.verifyCode(plainSecret, cleanInput);
      if (valid) {
        return true;
      }
    }

    // 2. Se falhar ou for código alfanumérico, tenta consumir código de backup
    if (mfaMethod.backupCodes && mfaMethod.backupCodes.length > 0) {
      const consumed = mfaMethod.consumeBackupCode(cleanInput);
      if (consumed) {
        await this.mfaRepo.save(client, mfaMethod);
        this.logger.warn(`Backup code consumed for user ${userId}, tenant ${tenantId}`);
        return true;
      }
    }

    return false;
  }
}
