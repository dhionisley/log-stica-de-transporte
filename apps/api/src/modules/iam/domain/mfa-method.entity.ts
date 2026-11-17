import { randomUUID } from 'node:crypto';
import { TotpEngine } from './crypto/totp';

export type MfaMethodType = 'TOTP' | 'BACKUP_CODES';
export type MfaMethodStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface MfaMethodProps {
  id: string;
  tenantId: string;
  userId: string;
  methodType: MfaMethodType;
  status: MfaMethodStatus;
  secretEncrypted?: string;
  backupCodes?: string[]; // Hashes SHA-256
  createdAt: Date;
  verifiedAt?: Date;
  updatedAt: Date;
}

export interface CreateMfaMethodProps {
  id?: string;
  tenantId: string;
  userId: string;
  methodType: MfaMethodType;
  secretEncrypted?: string;
  backupCodes?: string[];
}

export class MfaMethodDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MfaMethodDomainError';
  }
}

export class MfaMethod {
  private constructor(private props: MfaMethodProps) {}

  static create(props: CreateMfaMethodProps): MfaMethod {
    if (!props.tenantId) {
      throw new MfaMethodDomainError('Tenant ID is required');
    }
    if (!props.userId) {
      throw new MfaMethodDomainError('User ID is required');
    }

    const now = new Date();
    return new MfaMethod({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      userId: props.userId,
      methodType: props.methodType,
      status: 'PENDING',
      secretEncrypted: props.secretEncrypted,
      backupCodes: props.backupCodes,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: MfaMethodProps): MfaMethod {
    return new MfaMethod(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get methodType(): MfaMethodType {
    return this.props.methodType;
  }

  get status(): MfaMethodStatus {
    return this.props.status;
  }

  get secretEncrypted(): string | undefined {
    return this.props.secretEncrypted;
  }

  get backupCodes(): string[] | undefined {
    return this.props.backupCodes;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get verifiedAt(): Date | undefined {
    return this.props.verifiedAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }

  activate(now = new Date()): void {
    if (this.props.status === 'REVOKED') {
      throw new MfaMethodDomainError('Cannot activate a revoked MFA method');
    }
    this.props.status = 'ACTIVE';
    this.props.verifiedAt = now;
    this.props.updatedAt = now;
  }

  revoke(now = new Date()): void {
    this.props.status = 'REVOKED';
    this.props.updatedAt = now;
  }

  consumeBackupCode(plainCode: string): boolean {
    if (this.props.methodType !== 'BACKUP_CODES' || !this.props.backupCodes) {
      return false;
    }

    const result = TotpEngine.verifyAndConsumeBackupCode(plainCode, this.props.backupCodes);
    if (!result.valid) {
      return false;
    }

    this.props.backupCodes = result.remainingHashedCodes;
    this.props.updatedAt = new Date();
    return true;
  }
}

