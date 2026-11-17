import { randomUUID } from 'node:crypto';
import type { ScryptParams } from './crypto/password-hasher';
import { DEFAULT_SCRYPT_PARAMS, PasswordHasher } from './crypto/password-hasher';

export interface UserCredentialsProps {
  id: string;
  tenantId: string;
  userId: string;
  algorithm: string;
  passwordHash: string;
  passwordSalt: string;
  params: ScryptParams;
  failedAttempts: number;
  lockedUntil?: Date;
  passwordChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialsProps {
  id?: string;
  tenantId: string;
  userId: string;
  passwordHash: string;
  passwordSalt: string;
  params?: ScryptParams;
}

export class UserCredentialsDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserCredentialsDomainError';
  }
}

export class UserCredentials {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

  private constructor(private props: UserCredentialsProps) {}

  static create(props: CreateCredentialsProps): UserCredentials {
    if (!props.tenantId) {
      throw new UserCredentialsDomainError('Tenant ID is required');
    }
    if (!props.userId) {
      throw new UserCredentialsDomainError('User ID is required');
    }
    if (!props.passwordHash || !props.passwordSalt) {
      throw new UserCredentialsDomainError('Password hash and salt are required');
    }

    const now = new Date();
    return new UserCredentials({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      userId: props.userId,
      algorithm: 'scrypt',
      passwordHash: props.passwordHash,
      passwordSalt: props.passwordSalt,
      params: props.params ?? DEFAULT_SCRYPT_PARAMS,
      failedAttempts: 0,
      passwordChangedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: UserCredentialsProps): UserCredentials {
    return new UserCredentials(props);
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

  get algorithm(): string {
    return this.props.algorithm;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get passwordSalt(): string {
    return this.props.passwordSalt;
  }

  get params(): ScryptParams {
    return this.props.params;
  }

  get failedAttempts(): number {
    return this.props.failedAttempts;
  }

  get lockedUntil(): Date | undefined {
    return this.props.lockedUntil;
  }

  get passwordChangedAt(): Date {
    return this.props.passwordChangedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isLocked(now = new Date()): boolean {
    if (!this.props.lockedUntil) {
      return false;
    }
    return now.getTime() < this.props.lockedUntil.getTime();
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (this.isLocked()) {
      return false;
    }

    const valid = await PasswordHasher.verifyPassword(
      password,
      this.props.passwordHash,
      this.props.passwordSalt,
      this.props.params,
    );

    if (valid) {
      this.recordSuccessfulLogin();
      return true;
    }

    this.recordFailedAttempt();
    return false;
  }

  recordSuccessfulLogin(): void {
    this.props.failedAttempts = 0;
    this.props.lockedUntil = undefined;
    this.props.updatedAt = new Date();
  }

  recordFailedAttempt(now = new Date()): void {
    this.props.failedAttempts += 1;
    this.props.updatedAt = now;

    if (this.props.failedAttempts >= UserCredentials.MAX_FAILED_ATTEMPTS) {
      this.props.lockedUntil = new Date(now.getTime() + UserCredentials.LOCKOUT_DURATION_MS);
    }
  }

  updatePassword(hash: string, salt: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): void {
    const now = new Date();
    this.props.passwordHash = hash;
    this.props.passwordSalt = salt;
    this.props.params = params;
    this.props.failedAttempts = 0;
    this.props.lockedUntil = undefined;
    this.props.passwordChangedAt = now;
    this.props.updatedAt = now;
  }
}

