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
import type {
  IUserRepository,
  IPermissionProfileRepository,
  IUserProfileAssignmentRepository,
  IPermissionCatalogRepository,
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

