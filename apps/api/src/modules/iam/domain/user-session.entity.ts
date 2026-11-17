import { randomUUID } from 'node:crypto';

export interface UserSessionProps {
  id: string;
  tenantId: string;
  userId: string;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  refreshTokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revocationReason?: string;
  lastSeenAt: Date;
  updatedAt: Date;
}

export interface CreateUserSessionProps {
  id?: string;
  tenantId: string;
  userId: string;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  refreshTokenHash: string;
  durationMs?: number; // Padrão: 7 dias para refresh token
}

export class UserSessionDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserSessionDomainError';
  }
}

export class UserSession {
  static readonly DEFAULT_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

  private constructor(private props: UserSessionProps) {}

  static create(props: CreateUserSessionProps): UserSession {
    if (!props.tenantId) {
      throw new UserSessionDomainError('Tenant ID is required');
    }
    if (!props.userId) {
      throw new UserSessionDomainError('User ID is required');
    }
    if (!props.refreshTokenHash) {
      throw new UserSessionDomainError('Refresh token hash is required');
    }

    const now = new Date();
    const duration = props.durationMs ?? this.DEFAULT_SESSION_DURATION_MS;
    const expiresAt = new Date(now.getTime() + duration);

    return new UserSession({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      userId: props.userId,
      deviceId: props.deviceId,
      deviceName: props.deviceName,
      ipAddress: props.ipAddress,
      userAgent: props.userAgent,
      refreshTokenHash: props.refreshTokenHash,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: UserSessionProps): UserSession {
    return new UserSession(props);
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

  get deviceId(): string | undefined {
    return this.props.deviceId;
  }

  get deviceName(): string | undefined {
    return this.props.deviceName;
  }

  get ipAddress(): string | undefined {
    return this.props.ipAddress;
  }

  get userAgent(): string | undefined {
    return this.props.userAgent;
  }

  get refreshTokenHash(): string {
    return this.props.refreshTokenHash;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get revokedAt(): Date | undefined {
    return this.props.revokedAt;
  }

  get revocationReason(): string | undefined {
    return this.props.revocationReason;
  }

  get lastSeenAt(): Date {
    return this.props.lastSeenAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isActive(now = new Date()): boolean {
    if (this.props.revokedAt) {
      return false;
    }
    return now.getTime() < this.props.expiresAt.getTime();
  }

  touch(now = new Date()): void {
    this.props.lastSeenAt = now;
    this.props.updatedAt = now;
  }

  rotateRefreshToken(newRefreshTokenHash: string, durationMs?: number): void {
    if (!this.isActive()) {
      throw new UserSessionDomainError('Cannot rotate token on inactive or revoked session');
    }

    const now = new Date();
    const duration = durationMs ?? UserSession.DEFAULT_SESSION_DURATION_MS;

    this.props.refreshTokenHash = newRefreshTokenHash;
    this.props.expiresAt = new Date(now.getTime() + duration);
    this.props.lastSeenAt = now;
    this.props.updatedAt = now;
  }

  revoke(reason = 'USER_LOGOUT', now = new Date()): void {
    if (this.props.revokedAt) {
      return;
    }
    this.props.revokedAt = now;
    this.props.revocationReason = reason;
    this.props.updatedAt = now;
  }
}

