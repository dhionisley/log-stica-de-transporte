import type { PoolClient } from 'pg';
import type { User } from './user.entity';
import type { PermissionProfile } from './permission-profile.entity';
import type { UserProfileAssignment } from './user-profile-assignment.entity';
import type { UserCredentials } from './user-credentials.entity';
import type { UserSession } from './user-session.entity';
import type { MfaMethod, MfaMethodType } from './mfa-method.entity';

export interface PermissionItem {
  code: string;
  resource: string;
  action: string;
  description: string;
}

export interface IUserRepository {
  findById(client: PoolClient, tenantId: string, id: string): Promise<User | null>;
  findByEmail(client: PoolClient, tenantId: string, email: string): Promise<User | null>;
  save(client: PoolClient, user: User): Promise<void>;
  list(client: PoolClient, tenantId: string): Promise<User[]>;
}

export interface IPermissionProfileRepository {
  findById(client: PoolClient, tenantId: string, id: string): Promise<PermissionProfile | null>;
  findByName(client: PoolClient, tenantId: string, name: string): Promise<PermissionProfile | null>;
  list(client: PoolClient, tenantId: string): Promise<PermissionProfile[]>;
  save(client: PoolClient, profile: PermissionProfile): Promise<void>;
}

export interface IUserProfileAssignmentRepository {
  findActiveByUserId(
    client: PoolClient,
    tenantId: string,
    userId: string,
  ): Promise<UserProfileAssignment[]>;
  assign(client: PoolClient, assignment: UserProfileAssignment): Promise<void>;
  revoke(
    client: PoolClient,
    tenantId: string,
    userId: string,
    profileId: string,
  ): Promise<void>;
}

export interface IPermissionCatalogRepository {
  listAll(client: PoolClient): Promise<PermissionItem[]>;
  exists(client: PoolClient, code: string): Promise<boolean>;
}

export interface IUserCredentialsRepository {
  findByUserId(client: PoolClient, tenantId: string, userId: string): Promise<UserCredentials | null>;
  save(client: PoolClient, credentials: UserCredentials): Promise<void>;
}

export interface IUserSessionRepository {
  findById(client: PoolClient, tenantId: string, id: string): Promise<UserSession | null>;
  findByRefreshTokenHash(
    client: PoolClient,
    tenantId: string,
    refreshTokenHash: string,
  ): Promise<UserSession | null>;
  save(client: PoolClient, session: UserSession): Promise<void>;
  revokeAllForUser(client: PoolClient, tenantId: string, userId: string, reason?: string): Promise<void>;
  listActiveByUserId(client: PoolClient, tenantId: string, userId: string): Promise<UserSession[]>;
}

export interface IMfaMethodRepository {
  findByUserAndType(
    client: PoolClient,
    tenantId: string,
    userId: string,
    methodType: MfaMethodType,
  ): Promise<MfaMethod | null>;
  listByUser(client: PoolClient, tenantId: string, userId: string): Promise<MfaMethod[]>;
  save(client: PoolClient, method: MfaMethod): Promise<void>;
}
