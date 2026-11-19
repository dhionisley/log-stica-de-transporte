import { randomUUID } from 'node:crypto';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type PlatformAccountStatus = 'LINKED' | 'UNLINKED';

export interface EmployeeProps {
  id: string;
  tenantId: string;
  personId: string;
  platformAccountStatus: PlatformAccountStatus;
  status: EmployeeStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEmployeeProps {
  id?: string;
  tenantId: string;
  personId: string;
  platformAccountStatus?: PlatformAccountStatus;
}

export class EmployeeDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmployeeDomainError';
  }
}

export class Employee {
  private constructor(private props: EmployeeProps) {}

  static create(props: CreateEmployeeProps): Employee {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new EmployeeDomainError('tenantId is required');
    }
    if (!props.personId || props.personId.trim().length === 0) {
      throw new EmployeeDomainError('personId is required');
    }

    const now = new Date();
    return new Employee({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      personId: props.personId,
      platformAccountStatus: props.platformAccountStatus ?? 'UNLINKED',
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: EmployeeProps): Employee {
    return new Employee({ ...props });
  }

  get id(): string { return this.props.id; }
  get tenantId(): string { return this.props.tenantId; }
  get personId(): string { return this.props.personId; }
  get platformAccountStatus(): PlatformAccountStatus { return this.props.platformAccountStatus; }
  get status(): EmployeeStatus { return this.props.status; }
  get version(): number { return this.props.version; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  activate(): void {
    if (this.props.status === 'ACTIVE') return;
    this.props.status = 'ACTIVE';
    this.props.updatedAt = new Date();
  }

  inactivate(): void {
    if (this.props.status === 'INACTIVE') return;
    this.props.status = 'INACTIVE';
    this.props.updatedAt = new Date();
  }

  suspend(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new EmployeeDomainError('Reason is required when suspending an employee');
    }
    if (this.props.status === 'SUSPENDED') return;
    this.props.status = 'SUSPENDED';
    this.props.updatedAt = new Date();
  }

  linkPlatformAccount(): void {
    this.props.platformAccountStatus = 'LINKED';
    this.props.updatedAt = new Date();
  }

  unlinkPlatformAccount(): void {
    this.props.platformAccountStatus = 'UNLINKED';
    this.props.updatedAt = new Date();
  }
}
