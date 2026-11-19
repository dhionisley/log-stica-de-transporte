import { randomUUID } from 'node:crypto';

export type ProvisionalAuthStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface ProvisionalTransportAuthorizationProps {
  id: string;
  tenantId: string;
  employeeId: string;
  clientCompanyId: string;
  validFrom: Date;
  validTo: Date;
  status: ProvisionalAuthStatus;
  approvedBy?: string;
  approvedAt: Date;
  completedReason?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProvisionalAuthorizationProps {
  id?: string;
  tenantId: string;
  employeeId: string;
  clientCompanyId: string;
  validFrom: Date;
  validTo: Date;
  approvedBy?: string;
  completedReason?: string;
}

export class ProvisionalAuthorizationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvisionalAuthorizationDomainError';
  }
}

export class ProvisionalTransportAuthorization {
  private constructor(private props: ProvisionalTransportAuthorizationProps) {}

  static create(props: CreateProvisionalAuthorizationProps): ProvisionalTransportAuthorization {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new ProvisionalAuthorizationDomainError('tenantId is required');
    }
    if (!props.employeeId || props.employeeId.trim().length === 0) {
      throw new ProvisionalAuthorizationDomainError('employeeId is required');
    }
    if (!props.clientCompanyId || props.clientCompanyId.trim().length === 0) {
      throw new ProvisionalAuthorizationDomainError('clientCompanyId is required');
    }
    if (!props.validFrom) {
      throw new ProvisionalAuthorizationDomainError('validFrom is required');
    }
    if (!props.validTo) {
      throw new ProvisionalAuthorizationDomainError('validTo is required');
    }
    if (props.validTo <= props.validFrom) {
      throw new ProvisionalAuthorizationDomainError('validTo must be strictly after validFrom');
    }

    const now = new Date();
    return new ProvisionalTransportAuthorization({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      employeeId: props.employeeId,
      clientCompanyId: props.clientCompanyId,
      validFrom: props.validFrom,
      validTo: props.validTo,
      status: 'ACTIVE',
      approvedBy: props.approvedBy,
      approvedAt: now,
      completedReason: props.completedReason?.trim() || undefined,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ProvisionalTransportAuthorizationProps): ProvisionalTransportAuthorization {
    return new ProvisionalTransportAuthorization({ ...props });
  }

  get id(): string { return this.props.id; }
  get tenantId(): string { return this.props.tenantId; }
  get employeeId(): string { return this.props.employeeId; }
  get clientCompanyId(): string { return this.props.clientCompanyId; }
  get validFrom(): Date { return this.props.validFrom; }
  get validTo(): Date { return this.props.validTo; }
  get status(): ProvisionalAuthStatus { return this.props.status; }
  get approvedBy(): string | undefined { return this.props.approvedBy; }
  get approvedAt(): Date { return this.props.approvedAt; }
  get completedReason(): string | undefined { return this.props.completedReason; }
  get version(): number { return this.props.version; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  isValidAt(date: Date = new Date()): boolean {
    if (this.props.status !== 'ACTIVE') return false;
    return date >= this.props.validFrom && date <= this.props.validTo;
  }

  revoke(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new ProvisionalAuthorizationDomainError('Reason is required when revoking an authorization');
    }
    if (this.props.status === 'REVOKED') return;
    this.props.status = 'REVOKED';
    this.props.completedReason = reason.trim();
    this.props.updatedAt = new Date();
  }
}
