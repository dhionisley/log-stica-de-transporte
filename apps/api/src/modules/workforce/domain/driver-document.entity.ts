import { randomUUID } from 'node:crypto';
import { type DriverDocumentStatus, DriverDomainError } from './driver.types';

export interface DriverDocumentProps {
  id: string;
  tenantId: string;
  driverId: string;
  documentType: string;
  documentNumber: string;
  expiresAt?: Date;
  status: DriverDocumentStatus;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDriverDocumentProps {
  id?: string;
  tenantId: string;
  driverId: string;
  documentType: string;
  documentNumber: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export class DriverDocument {
  private constructor(private props: DriverDocumentProps) {}

  static create(props: CreateDriverDocumentProps): DriverDocument {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new DriverDomainError('tenantId is required');
    }
    if (!props.driverId || props.driverId.trim().length === 0) {
      throw new DriverDomainError('driverId is required');
    }
    if (!props.documentType || props.documentType.trim().length === 0) {
      throw new DriverDomainError('documentType is required');
    }
    if (!props.documentNumber || props.documentNumber.trim().length === 0) {
      throw new DriverDomainError('documentNumber is required');
    }

    const now = new Date();
    const status: DriverDocumentStatus =
      props.expiresAt && props.expiresAt.getTime() < now.getTime()
        ? 'EXPIRED'
        : 'VALID';

    return new DriverDocument({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      driverId: props.driverId,
      documentType: props.documentType.trim().toUpperCase(),
      documentNumber: props.documentNumber.trim(),
      expiresAt: props.expiresAt,
      status,
      metadata: props.metadata ?? {},
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: DriverDocumentProps): DriverDocument {
    return new DriverDocument(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get driverId(): string {
    return this.props.driverId;
  }

  get documentType(): string {
    return this.props.documentType;
  }

  get documentNumber(): string {
    return this.props.documentNumber;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  get status(): DriverDocumentStatus {
    return this.props.status;
  }

  get metadata(): Record<string, unknown> {
    return { ...this.props.metadata };
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

  isExpired(atDate: Date = new Date()): boolean {
    if (!this.props.expiresAt) {
      return false;
    }
    return this.props.expiresAt.getTime() < atDate.getTime();
  }

  updateValidity(atDate: Date = new Date()): void {
    if (this.isExpired(atDate) && this.props.status === 'VALID') {
      this.props.status = 'EXPIRED';
      this.props.updatedAt = new Date();
    }
  }

  toJSON(): DriverDocumentProps {
    return {
      ...this.props,
      metadata: { ...this.props.metadata },
    };
  }
}
