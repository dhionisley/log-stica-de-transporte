import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  User,
  type UserProps,
  type UserStatus,
} from '../domain/user.entity';
import {
  PermissionProfile,
  type ProfileType,
  type ProfileStatus,
} from '../domain/permission-profile.entity';
import {
  UserProfileAssignment,
  type UserProfileAssignmentProps,
} from '../domain/user-profile-assignment.entity';
import {
  UserCredentials,
  type UserCredentialsProps,
} from '../domain/user-credentials.entity';
import {
  UserSession,
  type UserSessionProps,
} from '../domain/user-session.entity';
import {
  MfaMethod,
  type MfaMethodProps,
  type MfaMethodType,
  type MfaMethodStatus,
} from '../domain/mfa-method.entity';
import type {
  IUserRepository,
  IPermissionProfileRepository,
  IUserProfileAssignmentRepository,
  IPermissionCatalogRepository,
  IUserCredentialsRepository,
  IUserSessionRepository,
  IMfaMethodRepository,
  PermissionItem,
} from '../domain/iam.repository';

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  email_normalized: string;
  phone_normalized: string | null;
  status: UserStatus;
  mfa_required: boolean;
  last_login_at: Date | null;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

interface ProfileRow {
  id: string;
  tenant_id: string;
  name: string;
  profile_type: ProfileType;
  status: ProfileStatus;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

interface AssignmentRow {
  id: string;
  tenant_id: string;
  user_id: string;
  profile_id: string;
  effective_from: Date;
  effective_to: Date | null;
  assigned_by: string | null;
  created_at: Date;
}

@Injectable()
export class PostgresUserRepository implements IUserRepository {
  async findById(client: PoolClient, tenantId: string, id: string): Promise<User | null> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<UserRow>(
      `SELECT id, tenant_id, email, email_normalized, phone_normalized, status, mfa_required, last_login_at, version, created_at, updated_at
       FROM iam.users
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );

    if (res.rows.length === 0) {
      return null;
    }
    return this.mapToEntity(res.rows[0]);
  }

  async findByEmail(client: PoolClient, tenantId: string, email: string): Promise<User | null> {
    await this.setTenantContext(client, tenantId);
    const normalized = email.trim().toLowerCase();
    const res = await client.query<UserRow>(
      `SELECT id, tenant_id, email, email_normalized, phone_normalized, status, mfa_required, last_login_at, version, created_at, updated_at
       FROM iam.users
       WHERE tenant_id = $1 AND email_normalized = $2`,
      [tenantId, normalized],
    );

    if (res.rows.length === 0) {
      return null;
    }
    return this.mapToEntity(res.rows[0]);
  }

  async save(client: PoolClient, user: User): Promise<void> {
    await this.setTenantContext(client, user.tenantId);
    await client.query(
      `INSERT INTO iam.users (
         id, tenant_id, email, email_normalized, phone_normalized, status, mfa_required, last_login_at, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         email_normalized = EXCLUDED.email_normalized,
         phone_normalized = EXCLUDED.phone_normalized,
         status = EXCLUDED.status,
         mfa_required = EXCLUDED.mfa_required,
         last_login_at = EXCLUDED.last_login_at,
         version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at`,
      [
        user.id,
        user.tenantId,
        user.email,
        user.emailNormalized,
        user.phoneNormalized ?? null,
        user.status,
        user.mfaRequired,
        user.lastLoginAt ?? null,
        user.version,
        user.createdAt,
        user.updatedAt,
      ],
    );
  }

  async list(client: PoolClient, tenantId: string): Promise<User[]> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<UserRow>(
      `SELECT id, tenant_id, email, email_normalized, phone_normalized, status, mfa_required, last_login_at, version, created_at, updated_at
       FROM iam.users
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId],
    );
    return res.rows.map((r) => this.mapToEntity(r));
  }

  private async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  }

  private mapToEntity(row: UserRow): User {
    const props: UserProps = {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      emailNormalized: row.email_normalized,
      phoneNormalized: row.phone_normalized ?? undefined,
      status: row.status,
      mfaRequired: row.mfa_required,
      lastLoginAt: row.last_login_at ?? undefined,
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return User.reconstitute(props);
  }
}

@Injectable()
export class PostgresPermissionProfileRepository implements IPermissionProfileRepository {
  async findById(client: PoolClient, tenantId: string, id: string): Promise<PermissionProfile | null> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<ProfileRow>(
      `SELECT id, tenant_id, name, profile_type, status, version, created_at, updated_at
       FROM iam.permission_profiles
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const permissions = await this.getProfilePermissions(client, tenantId, id);
    return this.mapToEntity(res.rows[0], permissions);
  }

  async findByName(client: PoolClient, tenantId: string, name: string): Promise<PermissionProfile | null> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<ProfileRow>(
      `SELECT id, tenant_id, name, profile_type, status, version, created_at, updated_at
       FROM iam.permission_profiles
       WHERE tenant_id = $1 AND name = $2`,
      [tenantId, name],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const permissions = await this.getProfilePermissions(client, tenantId, res.rows[0].id);
    return this.mapToEntity(res.rows[0], permissions);
  }

  async list(client: PoolClient, tenantId: string): Promise<PermissionProfile[]> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<ProfileRow>(
      `SELECT id, tenant_id, name, profile_type, status, version, created_at, updated_at
       FROM iam.permission_profiles
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [tenantId],
    );

    const profiles: PermissionProfile[] = [];
    for (const row of res.rows) {
      const perms = await this.getProfilePermissions(client, tenantId, row.id);
      profiles.push(this.mapToEntity(row, perms));
    }
    return profiles;
  }

  async save(client: PoolClient, profile: PermissionProfile): Promise<void> {
    await this.setTenantContext(client, profile.tenantId);
    await client.query(
      `INSERT INTO iam.permission_profiles (
         id, tenant_id, name, profile_type, status, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         profile_type = EXCLUDED.profile_type,
         status = EXCLUDED.status,
         version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at`,
      [
        profile.id,
        profile.tenantId,
        profile.name,
        profile.profileType,
        profile.status,
        profile.version,
        profile.createdAt,
        profile.updatedAt,
      ],
    );

    // Sincroniza permissões
    await client.query(
      `DELETE FROM iam.permission_profile_permissions
       WHERE tenant_id = $1 AND profile_id = $2`,
      [profile.tenantId, profile.id],
    );

    for (const code of profile.permissions) {
      await client.query(
        `INSERT INTO iam.permission_profile_permissions (
           tenant_id, profile_id, permission_code
         ) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [profile.tenantId, profile.id, code],
      );
    }
  }

  private async getProfilePermissions(
    client: PoolClient,
    tenantId: string,
    profileId: string,
  ): Promise<string[]> {
    const res = await client.query<{ permission_code: string }>(
      `SELECT permission_code
       FROM iam.permission_profile_permissions
       WHERE tenant_id = $1 AND profile_id = $2
       ORDER BY permission_code ASC`,
      [tenantId, profileId],
    );
    return res.rows.map((r) => r.permission_code);
  }

  private async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  }

  private mapToEntity(row: ProfileRow, permissions: string[]): PermissionProfile {
    return PermissionProfile.reconstitute({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      profileType: row.profile_type,
      status: row.status,
      permissions,
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}

@Injectable()
export class PostgresUserProfileAssignmentRepository
  implements IUserProfileAssignmentRepository
{
  async findActiveByUserId(
    client: PoolClient,
    tenantId: string,
    userId: string,
  ): Promise<UserProfileAssignment[]> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<AssignmentRow>(
      `SELECT id, tenant_id, user_id, profile_id, effective_from, effective_to, assigned_by, created_at
       FROM iam.user_profile_assignments
       WHERE tenant_id = $1 AND user_id = $2
         AND effective_from <= now()
         AND (effective_to IS NULL OR effective_to > now())`,
      [tenantId, userId],
    );

    return res.rows.map((r) => this.mapToEntity(r));
  }

  async assign(client: PoolClient, assignment: UserProfileAssignment): Promise<void> {
    await this.setTenantContext(client, assignment.tenantId);
    await client.query(
      `INSERT INTO iam.user_profile_assignments (
         id, tenant_id, user_id, profile_id, effective_from, effective_to, assigned_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, user_id, profile_id) DO UPDATE SET
         effective_from = EXCLUDED.effective_from,
         effective_to = EXCLUDED.effective_to,
         assigned_by = EXCLUDED.assigned_by`,
      [
        assignment.id,
        assignment.tenantId,
        assignment.userId,
        assignment.profileId,
        assignment.effectiveFrom,
        assignment.effectiveTo ?? null,
        assignment.assignedBy ?? null,
        assignment.createdAt,
      ],
    );
  }

  async revoke(
    client: PoolClient,
    tenantId: string,
    userId: string,
    profileId: string,
  ): Promise<void> {
    await this.setTenantContext(client, tenantId);
    await client.query(
      `UPDATE iam.user_profile_assignments
       SET effective_to = now()
       WHERE tenant_id = $1 AND user_id = $2 AND profile_id = $3
         AND (effective_to IS NULL OR effective_to > now())`,
      [tenantId, userId, profileId],
    );
  }

  private async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  }

  private mapToEntity(row: AssignmentRow): UserProfileAssignment {
    const props: UserProfileAssignmentProps = {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      profileId: row.profile_id,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to ?? undefined,
      assignedBy: row.assigned_by ?? undefined,
      createdAt: row.created_at,
    };
    return UserProfileAssignment.reconstitute(props);
  }
}

@Injectable()
export class PostgresPermissionCatalogRepository implements IPermissionCatalogRepository {
  async listAll(client: PoolClient): Promise<PermissionItem[]> {
    const res = await client.query<PermissionItem>(
      `SELECT code, resource, action, description
       FROM iam.permissions
       ORDER BY code ASC`,
    );
    return res.rows;
  }

  async exists(client: PoolClient, code: string): Promise<boolean> {
    const res = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM iam.permissions WHERE code = $1) AS exists`,
      [code],
    );
    return Boolean(res.rows[0]?.exists);
  }
}

interface CredentialsRow {
  id: string;
  tenant_id: string;
  user_id: string;
  algorithm: string;
  password_hash: string;
  password_salt: string;
  params: { N: number; r: number; p: number };
  failed_attempts: number;
  locked_until: Date | null;
  password_changed_at: Date;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PostgresUserCredentialsRepository implements IUserCredentialsRepository {
  async findByUserId(client: PoolClient, tenantId: string, userId: string): Promise<UserCredentials | null> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<CredentialsRow>(
      `SELECT id, tenant_id, user_id, algorithm, password_hash, password_salt, params, failed_attempts, locked_until, password_changed_at, created_at, updated_at
       FROM iam.user_credentials
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );

    if (res.rows.length === 0) {
      return null;
    }
    return this.mapToEntity(res.rows[0]);
  }

  async save(client: PoolClient, credentials: UserCredentials): Promise<void> {
    await this.setTenantContext(client, credentials.tenantId);
    await client.query(
      `INSERT INTO iam.user_credentials (
         id, tenant_id, user_id, algorithm, password_hash, password_salt, params, failed_attempts, locked_until, password_changed_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         password_salt = EXCLUDED.password_salt,
         params = EXCLUDED.params,
         failed_attempts = EXCLUDED.failed_attempts,
         locked_until = EXCLUDED.locked_until,
         password_changed_at = EXCLUDED.password_changed_at,
         updated_at = EXCLUDED.updated_at`,
      [
        credentials.id,
        credentials.tenantId,
        credentials.userId,
        credentials.algorithm,
        credentials.passwordHash,
        credentials.passwordSalt,
        JSON.stringify(credentials.params),
        credentials.failedAttempts,
        credentials.lockedUntil ?? null,
        credentials.passwordChangedAt,
        credentials.createdAt,
        credentials.updatedAt,
      ],
    );
  }

  private async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  }

  private mapToEntity(row: CredentialsRow): UserCredentials {
    const props: UserCredentialsProps = {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      algorithm: row.algorithm,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
      failedAttempts: Number(row.failed_attempts),
      lockedUntil: row.locked_until ?? undefined,
      passwordChangedAt: row.password_changed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return UserCredentials.reconstitute(props);
  }
}

interface SessionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  device_id: string | null;
  device_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  refresh_token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revocation_reason: string | null;
  last_seen_at: Date;
  updated_at: Date;
}

@Injectable()
export class PostgresUserSessionRepository implements IUserSessionRepository {
  async findById(client: PoolClient, tenantId: string, id: string): Promise<UserSession | null> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<SessionRow>(
      `SELECT id, tenant_id, user_id, device_id, device_name, ip_address, user_agent, refresh_token_hash, created_at, expires_at, revoked_at, revocation_reason, last_seen_at, updated_at
       FROM iam.sessions
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );

    if (res.rows.length === 0) {
      return null;
    }
    return this.mapToEntity(res.rows[0]);
  }

  async findByRefreshTokenHash(
    client: PoolClient,
    tenantId: string,
    refreshTokenHash: string,
  ): Promise<UserSession | null> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<SessionRow>(
      `SELECT id, tenant_id, user_id, device_id, device_name, ip_address, user_agent, refresh_token_hash, created_at, expires_at, revoked_at, revocation_reason, last_seen_at, updated_at
       FROM iam.sessions
       WHERE tenant_id = $1 AND refresh_token_hash = $2`,
      [tenantId, refreshTokenHash],
    );

    if (res.rows.length === 0) {
      return null;
    }
    return this.mapToEntity(res.rows[0]);
  }

  async save(client: PoolClient, session: UserSession): Promise<void> {
    await this.setTenantContext(client, session.tenantId);
    await client.query(
      `INSERT INTO iam.sessions (
         id, tenant_id, user_id, device_id, device_name, ip_address, user_agent, refresh_token_hash, created_at, expires_at, revoked_at, revocation_reason, last_seen_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         refresh_token_hash = EXCLUDED.refresh_token_hash,
         expires_at = EXCLUDED.expires_at,
         revoked_at = EXCLUDED.revoked_at,
         revocation_reason = EXCLUDED.revocation_reason,
         last_seen_at = EXCLUDED.last_seen_at,
         updated_at = EXCLUDED.updated_at`,
      [
        session.id,
        session.tenantId,
        session.userId,
        session.deviceId ?? null,
        session.deviceName ?? null,
        session.ipAddress ?? null,
        session.userAgent ?? null,
        session.refreshTokenHash,
        session.createdAt,
        session.expiresAt,
        session.revokedAt ?? null,
        session.revocationReason ?? null,
        session.lastSeenAt,
        session.updatedAt,
      ],
    );
  }

  async revokeAllForUser(client: PoolClient, tenantId: string, userId: string, reason = 'BULK_REVOCATION'): Promise<void> {
    await this.setTenantContext(client, tenantId);
    await client.query(
      `UPDATE iam.sessions
       SET revoked_at = now(), revocation_reason = $3, updated_at = now()
       WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [tenantId, userId, reason],
    );
  }

  async listActiveByUserId(client: PoolClient, tenantId: string, userId: string): Promise<UserSession[]> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<SessionRow>(
      `SELECT id, tenant_id, user_id, device_id, device_name, ip_address, user_agent, refresh_token_hash, created_at, expires_at, revoked_at, revocation_reason, last_seen_at, updated_at
       FROM iam.sessions
       WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY last_seen_at DESC`,
      [tenantId, userId],
    );
    return res.rows.map((r) => this.mapToEntity(r));
  }

  private async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  }

  private mapToEntity(row: SessionRow): UserSession {
    const props: UserSessionProps = {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      deviceId: row.device_id ?? undefined,
      deviceName: row.device_name ?? undefined,
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
      refreshTokenHash: row.refresh_token_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? undefined,
      revocationReason: row.revocation_reason ?? undefined,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    };
    return UserSession.reconstitute(props);
  }
}

interface MfaRow {
  id: string;
  tenant_id: string;
  user_id: string;
  method_type: MfaMethodType;
  status: MfaMethodStatus;
  secret_encrypted: string | null;
  backup_codes: string[] | string | null;
  created_at: Date;
  verified_at: Date | null;
  updated_at: Date;
}

@Injectable()
export class PostgresMfaMethodRepository implements IMfaMethodRepository {
  async findByUserAndType(
    client: PoolClient,
    tenantId: string,
    userId: string,
    methodType: MfaMethodType,
  ): Promise<MfaMethod | null> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<MfaRow>(
      `SELECT id, tenant_id, user_id, method_type, status, secret_encrypted, backup_codes, created_at, verified_at, updated_at
       FROM iam.mfa_methods
       WHERE tenant_id = $1 AND user_id = $2 AND method_type = $3`,
      [tenantId, userId, methodType],
    );

    if (res.rows.length === 0) {
      return null;
    }
    return this.mapToEntity(res.rows[0]);
  }

  async listByUser(client: PoolClient, tenantId: string, userId: string): Promise<MfaMethod[]> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<MfaRow>(
      `SELECT id, tenant_id, user_id, method_type, status, secret_encrypted, backup_codes, created_at, verified_at, updated_at
       FROM iam.mfa_methods
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [tenantId, userId],
    );
    return res.rows.map((r) => this.mapToEntity(r));
  }

  async save(client: PoolClient, method: MfaMethod): Promise<void> {
    await this.setTenantContext(client, method.tenantId);
    await client.query(
      `INSERT INTO iam.mfa_methods (
         id, tenant_id, user_id, method_type, status, secret_encrypted, backup_codes, created_at, verified_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id, user_id, method_type) DO UPDATE SET
         status = EXCLUDED.status,
         secret_encrypted = EXCLUDED.secret_encrypted,
         backup_codes = EXCLUDED.backup_codes,
         verified_at = EXCLUDED.verified_at,
         updated_at = EXCLUDED.updated_at`,
      [
        method.id,
        method.tenantId,
        method.userId,
        method.methodType,
        method.status,
        method.secretEncrypted ?? null,
        method.backupCodes ? JSON.stringify(method.backupCodes) : null,
        method.createdAt,
        method.verifiedAt ?? null,
        method.updatedAt,
      ],
    );
  }

  private async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  }

  private mapToEntity(row: MfaRow): MfaMethod {
    let parsedBackupCodes: string[] | undefined;
    if (row.backup_codes) {
      parsedBackupCodes =
        typeof row.backup_codes === 'string' ? JSON.parse(row.backup_codes) : row.backup_codes;
    }

    const props: MfaMethodProps = {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      methodType: row.method_type,
      status: row.status,
      secretEncrypted: row.secret_encrypted ?? undefined,
      backupCodes: parsedBackupCodes,
      createdAt: row.created_at,
      verifiedAt: row.verified_at ?? undefined,
      updatedAt: row.updated_at,
    };
    return MfaMethod.reconstitute(props);
  }
}

