import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresOutboxRepository } from '../../outbox/infrastructure/postgres-outbox.repository';
import {
  User,
  type UserStatus,
} from '../domain/user.entity';
import {
  PermissionProfile,
  type ProfileType,
  type ProfileStatus,
} from '../domain/permission-profile.entity';
import { UserProfileAssignment } from '../domain/user-profile-assignment.entity';
import {
  PostgresUserRepository,
  PostgresPermissionProfileRepository,
  PostgresUserProfileAssignmentRepository,
  PostgresPermissionCatalogRepository,
} from '../infrastructure/postgres-iam.repository';

export interface CreateUserDto {
  email: string;
  phoneNormalized?: string;
  mfaRequired?: boolean;
}

export interface UserResponseDto {
  id: string;
  tenantId: string;
  email: string;
  emailNormalized: string;
  phoneNormalized?: string;
  status: UserStatus;
  mfaRequired: boolean;
  lastLoginAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePermissionProfileDto {
  name: string;
  profileType?: ProfileType;
  permissions?: string[];
}

export interface PermissionProfileResponseDto {
  id: string;
  tenantId: string;
  name: string;
  profileType: ProfileType;
  status: ProfileStatus;
  permissions: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssignProfileDto {
  userId: string;
  profileId: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = 'UserNotFoundError';
  }
}

export class ProfileNotFoundError extends Error {
  constructor(id: string) {
    super(`Permission profile not found: ${id}`);
    this.name = 'ProfileNotFoundError';
  }
}

export class UserEmailConflictError extends Error {
  constructor(email: string) {
    super(`User with email "${email}" already exists in this tenant`);
    this.name = 'UserEmailConflictError';
  }
}

export class ProfileNameConflictError extends Error {
  constructor(name: string) {
    super(`Profile with name "${name}" already exists in this tenant`);
    this.name = 'ProfileNameConflictError';
  }
}

export class InvalidPermissionCodeError extends Error {
  constructor(code: string) {
    super(`Permission code "${code}" does not exist in the global catalog`);
    this.name = 'InvalidPermissionCodeError';
  }
}

function toUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
}

@Injectable()
export class IamManagementService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly userRepository: PostgresUserRepository,
    private readonly profileRepository: PostgresPermissionProfileRepository,
    private readonly assignmentRepository: PostgresUserProfileAssignmentRepository,
    private readonly catalogRepository: PostgresPermissionCatalogRepository,
    private readonly outboxRepository: PostgresOutboxRepository,
  ) {}

  async createUser(
    tenantId: string,
    dto: CreateUserDto,
    actorId = 'system',
  ): Promise<UserResponseDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

      const existing = await this.userRepository.findByEmail(client, tenantId, dto.email);
      if (existing) {
        throw new UserEmailConflictError(dto.email);
      }

      const user = User.create({
        tenantId,
        email: dto.email,
        phoneNormalized: dto.phoneNormalized,
        mfaRequired: dto.mfaRequired,
      });

      await this.userRepository.save(client, user);

      // Outbox
      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        eventType: 'UserCreated',
        schemaVersion: 1,
        aggregateType: 'User',
        aggregateId: user.id,
        aggregateVersion: user.version,
        occurredAt: new Date(),
        payload: {
          userId: user.id,
          tenantId: user.tenantId,
          email: user.email,
          status: user.status,
          mfaRequired: user.mfaRequired,
        },
      });

      // Audit
      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'SYSTEM',
          toUuidOrNull(actorId),
          'USER_CREATED',
          'User',
          user.id,
          JSON.stringify({ email: user.email, status: user.status }),
        ],
      );

      await client.query('COMMIT');
      return this.toUserDto(user);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async createProfile(
    tenantId: string,
    dto: CreatePermissionProfileDto,
    actorId = 'system',
  ): Promise<PermissionProfileResponseDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

      // Valida que as permissões existem no catálogo
      if (dto.permissions && dto.permissions.length > 0) {
        for (const code of dto.permissions) {
          const exists = await this.catalogRepository.exists(client, code);
          if (!exists) {
            throw new InvalidPermissionCodeError(code);
          }
        }
      }

      const existing = await this.profileRepository.findByName(client, tenantId, dto.name);
      if (existing) {
        throw new ProfileNameConflictError(dto.name);
      }

      const profile = PermissionProfile.create({
        tenantId,
        name: dto.name,
        profileType: dto.profileType,
        permissions: dto.permissions,
      });

      await this.profileRepository.save(client, profile);

      // Outbox
      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        eventType: 'PermissionProfileCreated',
        schemaVersion: 1,
        aggregateType: 'PermissionProfile',
        aggregateId: profile.id,
        aggregateVersion: profile.version,
        occurredAt: new Date(),
        payload: {
          profileId: profile.id,
          tenantId: profile.tenantId,
          name: profile.name,
          profileType: profile.profileType,
          permissions: Array.from(profile.permissions),
        },
      });

      // Audit
      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'SYSTEM',
          toUuidOrNull(actorId),
          'PERMISSION_PROFILE_CREATED',
          'PermissionProfile',
          profile.id,
          JSON.stringify({ name: profile.name, profileType: profile.profileType }),
        ],
      );

      await client.query('COMMIT');
      return this.toProfileDto(profile);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async assignProfileToUser(
    tenantId: string,
    dto: AssignProfileDto,
    actorId = 'system',
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

      const user = await this.userRepository.findById(client, tenantId, dto.userId);
      if (!user) {
        throw new UserNotFoundError(dto.userId);
      }

      const profile = await this.profileRepository.findById(client, tenantId, dto.profileId);
      if (!profile) {
        throw new ProfileNotFoundError(dto.profileId);
      }

      const assignment = UserProfileAssignment.create({
        tenantId,
        userId: dto.userId,
        profileId: dto.profileId,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        assignedBy: actorId,
      });

      await this.assignmentRepository.assign(client, assignment);

      // Outbox
      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        eventType: 'UserProfileAssigned',
        schemaVersion: 1,
        aggregateType: 'UserProfileAssignment',
        aggregateId: assignment.id,
        aggregateVersion: 1,
        occurredAt: new Date(),
        payload: {
          assignmentId: assignment.id,
          tenantId: assignment.tenantId,
          userId: assignment.userId,
          profileId: assignment.profileId,
          effectiveFrom: assignment.effectiveFrom.toISOString(),
          effectiveTo: assignment.effectiveTo?.toISOString() ?? null,
        },
      });

      // Audit
      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'SYSTEM',
          toUuidOrNull(actorId),
          'USER_PROFILE_ASSIGNED',
          'UserProfileAssignment',
          assignment.id,
          JSON.stringify({
            userId: assignment.userId,
            profileId: assignment.profileId,
          }),
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async revokeProfileFromUser(
    tenantId: string,
    userId: string,
    profileId: string,
    actorId = 'system',
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

      await this.assignmentRepository.revoke(client, tenantId, userId, profileId);

      // Outbox
      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        eventType: 'UserProfileRevoked',
        schemaVersion: 1,
        aggregateType: 'UserProfileAssignment',
        aggregateId: userId,
        aggregateVersion: 1,
        occurredAt: new Date(),
        payload: {
          tenantId,
          userId,
          profileId,
          revokedAt: new Date().toISOString(),
        },
      });

      // Audit
      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'SYSTEM',
          toUuidOrNull(actorId),
          'USER_PROFILE_REVOKED',
          'UserProfileAssignment',
          userId,
          JSON.stringify({ userId, profileId }),
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listUsers(tenantId: string): Promise<UserResponseDto[]> {
    const client = await this.pool.connect();
    try {
      const users = await this.userRepository.list(client, tenantId);
      return users.map((u) => this.toUserDto(u));
    } finally {
      client.release();
    }
  }

  async listProfiles(tenantId: string): Promise<PermissionProfileResponseDto[]> {
    const client = await this.pool.connect();
    try {
      const profiles = await this.profileRepository.list(client, tenantId);
      return profiles.map((p) => this.toProfileDto(p));
    } finally {
      client.release();
    }
  }

  async listPermissions(): Promise<{ code: string; resource: string; action: string; description: string }[]> {
    const client = await this.pool.connect();
    try {
      return await this.catalogRepository.listAll(client);
    } finally {
      client.release();
    }
  }

  private toUserDto(user: User): UserResponseDto {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      emailNormalized: user.emailNormalized,
      phoneNormalized: user.phoneNormalized,
      status: user.status,
      mfaRequired: user.mfaRequired,
      lastLoginAt: user.lastLoginAt?.toISOString(),
      version: user.version,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private toProfileDto(profile: PermissionProfile): PermissionProfileResponseDto {
    return {
      id: profile.id,
      tenantId: profile.tenantId,
      name: profile.name,
      profileType: profile.profileType,
      status: profile.status,
      permissions: Array.from(profile.permissions),
      version: profile.version,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}

