import { randomUUID } from 'node:crypto';

export type ProfileType = 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'CUSTOM';
export type ProfileStatus = 'ACTIVE' | 'INACTIVE';

export interface PermissionProfileProps {
  id: string;
  tenantId: string;
  name: string;
  profileType: ProfileType;
  status: ProfileStatus;
  permissions: Set<string>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePermissionProfileProps {
  id?: string;
  tenantId: string;
  name: string;
  profileType?: ProfileType;
  permissions?: string[];
}

export class PermissionProfileDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionProfileDomainError';
  }
}

export class PermissionProfile {
  private constructor(private props: PermissionProfileProps) {}

  static create(props: CreatePermissionProfileProps): PermissionProfile {
    const trimmedName = props.name ? props.name.trim() : '';
    if (!trimmedName) {
      throw new PermissionProfileDomainError('Profile name is required');
    }

    if (!props.tenantId) {
      throw new PermissionProfileDomainError('Tenant ID is required');
    }

    const now = new Date();
    return new PermissionProfile({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      name: trimmedName,
      profileType: props.profileType ?? 'CUSTOM',
      status: 'ACTIVE',
      permissions: new Set(props.permissions ?? []),
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: {
    id: string;
    tenantId: string;
    name: string;
    profileType: ProfileType;
    status: ProfileStatus;
    permissions: string[];
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): PermissionProfile {
    return new PermissionProfile({
      ...props,
      permissions: new Set(props.permissions),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get name(): string {
    return this.props.name;
  }

  get profileType(): ProfileType {
    return this.props.profileType;
  }

  get status(): ProfileStatus {
    return this.props.status;
  }

  get permissions(): ReadonlySet<string> {
    return this.props.permissions;
  }

  get version(): number {
    return this.props.version;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  grantPermission(code: string): void {
    const normalized = code.trim();
    if (!normalized) {
      return;
    }
    if (!this.props.permissions.has(normalized)) {
      this.props.permissions.add(normalized);
      this.touch();
    }
  }

  revokePermission(code: string): void {
    const normalized = code.trim();
    if (this.props.permissions.has(normalized)) {
      this.props.permissions.delete(normalized);
      this.touch();
    }
  }

  updatePermissions(codes: string[]): void {
    const newSet = new Set(codes.map((c) => c.trim()).filter(Boolean));
    this.props.permissions = newSet;
    this.touch();
  }

  hasPermission(code: string): boolean {
    return this.props.status === 'ACTIVE' && this.props.permissions.has(code);
  }

  deactivate(): void {
    if (this.props.status === 'INACTIVE') {
      return;
    }
    this.props.status = 'INACTIVE';
    this.touch();
  }

  activate(): void {
    if (this.props.status === 'ACTIVE') {
      return;
    }
    this.props.status = 'ACTIVE';
    this.touch();
  }

  private touch(): void {
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }

  toObject(): {
    id: string;
    tenantId: string;
    name: string;
    profileType: ProfileType;
    status: ProfileStatus;
    permissions: string[];
    version: number;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      ...this.props,
      permissions: Array.from(this.props.permissions),
    };
  }
}

