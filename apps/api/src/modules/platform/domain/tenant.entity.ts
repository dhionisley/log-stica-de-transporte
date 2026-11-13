import { randomUUID } from 'node:crypto';

export type TenantStatus = 'PROVISIONED' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface TenantProps {
  id: string;
  slug: string;
  legalName: string;
  commercialName?: string;
  status: TenantStatus;
  defaultTimezone: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantProps {
  id?: string;
  slug: string;
  legalName: string;
  commercialName?: string;
  defaultTimezone?: string;
}

export class TenantDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantDomainError';
  }
}

export class Tenant {
  private constructor(private props: TenantProps) {}

  static create(props: CreateTenantProps): Tenant {
    const slug = props.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new TenantDomainError(
        'Invalid slug format: must contain only lowercase alphanumeric characters and hyphens',
      );
    }

    if (!props.legalName || props.legalName.trim().length === 0) {
      throw new TenantDomainError('Legal name is required');
    }

    const now = new Date();
    return new Tenant({
      id: props.id ?? randomUUID(),
      slug,
      legalName: props.legalName.trim(),
      commercialName: props.commercialName?.trim() || undefined,
      status: 'PROVISIONED',
      defaultTimezone: props.defaultTimezone ?? 'America/Sao_Paulo',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: TenantProps): Tenant {
    return new Tenant({ ...props });
  }

  get id(): string { return this.props.id; }
  get slug(): string { return this.props.slug; }
  get legalName(): string { return this.props.legalName; }
  get commercialName(): string | undefined { return this.props.commercialName; }
  get status(): TenantStatus { return this.props.status; }
  get defaultTimezone(): string { return this.props.defaultTimezone; }
  get version(): number { return this.props.version; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  activate(): void {
    if (this.props.status === 'TERMINATED') {
      throw new TenantDomainError('Cannot activate a terminated tenant');
    }
    if (this.props.status === 'ACTIVE') {
      return; // Idempotente
    }
    this.props.status = 'ACTIVE';
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }

  suspend(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new TenantDomainError('Suspension reason is required');
    }
    if (this.props.status === 'TERMINATED') {
      throw new TenantDomainError('Cannot suspend a terminated tenant');
    }
    if (this.props.status === 'PROVISIONED') {
      throw new TenantDomainError('Cannot suspend a tenant that has not been activated');
    }
    if (this.props.status === 'SUSPENDED') {
      return; // Idempotente
    }
    this.props.status = 'SUSPENDED';
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }

  terminate(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new TenantDomainError('Termination reason is required');
    }
    if (this.props.status === 'TERMINATED') {
      return; // Idempotente
    }
    this.props.status = 'TERMINATED';
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }

  canPerformOperations(): boolean {
    return this.props.status === 'ACTIVE';
  }

  updateInfo(props: { legalName?: string; commercialName?: string; defaultTimezone?: string }): void {
    if (this.props.status === 'TERMINATED') {
      throw new TenantDomainError('Cannot update a terminated tenant');
    }
    if (props.legalName !== undefined) {
      if (!props.legalName.trim()) throw new TenantDomainError('Legal name cannot be empty');
      this.props.legalName = props.legalName.trim();
    }
    if (props.commercialName !== undefined) {
      this.props.commercialName = props.commercialName.trim() || undefined;
    }
    if (props.defaultTimezone !== undefined) {
      if (!props.defaultTimezone.trim()) throw new TenantDomainError('Timezone cannot be empty');
      this.props.defaultTimezone = props.defaultTimezone.trim();
    }
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }
}

