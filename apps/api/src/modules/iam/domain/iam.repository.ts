import type { PoolClient } from 'pg';
import type { User } from './user.entity';
import type { PermissionProfile } from './permission-profile.entity';
import type { UserProfileAssignment } from './user-profile-assignment.entity';

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

