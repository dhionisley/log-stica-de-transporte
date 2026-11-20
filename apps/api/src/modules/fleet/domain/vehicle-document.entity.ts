import { randomUUID } from 'node:crypto';
import { type DocumentStatus, VehicleDomainError } from './vehicle.types';

export interface VehicleDocumentProps {
  id: string;
  tenantId: string;
  vehicleId: string;
  documentType: string;
  documentNumber: string;
  expiresAt?: Date;
  status: DocumentStatus;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVehicleDocumentProps {
  id?: string;
  tenantId: string;
  vehicleId: string;
  documentType: string;
  documentNumber: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export class VehicleDocument {
  private constructor(private props: VehicleDocumentProps) {}

  static create(props: CreateVehicleDocumentProps): VehicleDocument {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new VehicleDomainError('tenantId is required');
    }
    if (!props.vehicleId || props.vehicleId.trim().length === 0) {
      throw new VehicleDomainError('vehicleId is required');
    }
    if (!props.documentType || props.documentType.trim().length === 0) {
      throw new VehicleDomainError('documentType is required');
    }
    if (!props.documentNumber || props.documentNumber.trim().length === 0) {
      throw new VehicleDomainError('documentNumber is required');
    }

    const now = new Date();
    const status: DocumentStatus =
      props.expiresAt && props.expiresAt.getTime() < now.getTime()
        ? 'EXPIRED'
        : 'VALID';

    return new VehicleDocument({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      vehicleId: props.vehicleId,
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

  static reconstitute(props: VehicleDocumentProps): VehicleDocument {
    return new VehicleDocument(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get vehicleId(): string {
    return this.props.vehicleId;
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

  get status(): DocumentStatus {
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

  toJSON(): VehicleDocumentProps {
    return {
      ...this.props,
      metadata: { ...this.props.metadata },
    };
  }
}
