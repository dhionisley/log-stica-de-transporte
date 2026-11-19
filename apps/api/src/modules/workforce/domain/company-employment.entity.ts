import { randomUUID } from 'node:crypto';

export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED';

export interface CompanyEmploymentProps {
  id: string;
  tenantId: string;
  employeeId: string;
  clientCompanyId: string;
  externalEmployeeCode?: string;
  validFrom: Date;
  validTo?: Date;
  status: EmploymentStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompanyEmploymentProps {
  id?: string;
  tenantId: string;
  employeeId: string;
  clientCompanyId: string;
  externalEmployeeCode?: string;
  validFrom?: Date;
  validTo?: Date;
}

export class CompanyEmploymentDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyEmploymentDomainError';
  }
}

export class CompanyEmployment {
  private constructor(private props: CompanyEmploymentProps) {}

  static create(props: CreateCompanyEmploymentProps): CompanyEmployment {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new CompanyEmploymentDomainError('tenantId is required');
    }
    if (!props.employeeId || props.employeeId.trim().length === 0) {
      throw new CompanyEmploymentDomainError('employeeId is required');
    }
    if (!props.clientCompanyId || props.clientCompanyId.trim().length === 0) {
      throw new CompanyEmploymentDomainError('clientCompanyId is required');
    }

    const validFrom = props.validFrom ?? new Date();
    if (props.validTo && props.validTo < validFrom) {
      throw new CompanyEmploymentDomainError('validTo cannot be earlier than validFrom');
    }

    const now = new Date();
    return new CompanyEmployment({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      employeeId: props.employeeId,
      clientCompanyId: props.clientCompanyId,
      externalEmployeeCode: props.externalEmployeeCode?.trim() || undefined,
      validFrom,
      validTo: props.validTo,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: CompanyEmploymentProps): CompanyEmployment {
    return new CompanyEmployment({ ...props });
  }

  get id(): string { return this.props.id; }
  get tenantId(): string { return this.props.tenantId; }
  get employeeId(): string { return this.props.employeeId; }
  get clientCompanyId(): string { return this.props.clientCompanyId; }
  get externalEmployeeCode(): string | undefined { return this.props.externalEmployeeCode; }
  get validFrom(): Date { return this.props.validFrom; }
  get validTo(): Date | undefined { return this.props.validTo; }
  get status(): EmploymentStatus { return this.props.status; }
  get version(): number { return this.props.version; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  isActiveAt(date: Date = new Date()): boolean {
    if (this.props.status !== 'ACTIVE') return false;
    if (date < this.props.validFrom) return false;
    if (this.props.validTo && date > this.props.validTo) return false;
    return true;
  }

  terminate(terminatedAt: Date = new Date()): void {
    if (this.props.status === 'TERMINATED') return;
    this.props.status = 'TERMINATED';
    this.props.validTo = terminatedAt;
    this.props.updatedAt = new Date();
  }

  inactivate(): void {
    if (this.props.status === 'INACTIVE') return;
    this.props.status = 'INACTIVE';
    this.props.updatedAt = new Date();
  }
}
