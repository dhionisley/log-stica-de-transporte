import { randomUUID } from 'node:crypto';
import {
  type DriverLicenseCategory,
  type DriverStatus,
  DriverDomainError,
  VALID_LICENSE_CATEGORIES,
} from './driver.types';
import type { DriverDocument } from './driver-document.entity';

export interface DriverProps {
  id: string;
  tenantId: string;
  personId: string;
  licenseNumber: string;
  licenseCategory: DriverLicenseCategory;
  licenseExpiresAt: Date;
  status: DriverStatus;
  suspensionReason?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDriverProps {
  id?: string;
  tenantId: string;
  personId: string;
  licenseNumber: string;
  licenseCategory: DriverLicenseCategory;
  licenseExpiresAt: Date;
}

export interface UpdateDriverProps {
  licenseCategory?: DriverLicenseCategory;
  licenseExpiresAt?: Date;
}

export class Driver {
  private documents: DriverDocument[] = [];

  private constructor(private props: DriverProps) {}

  static create(props: CreateDriverProps): Driver {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new DriverDomainError('tenantId is required');
    }
    if (!props.personId || props.personId.trim().length === 0) {
      throw new DriverDomainError('personId is required');
    }
    const licenseNumber = props.licenseNumber?.trim();
    if (!licenseNumber || licenseNumber.length === 0) {
      throw new DriverDomainError('licenseNumber is required');
    }

    if (!VALID_LICENSE_CATEGORIES.has(props.licenseCategory)) {
      throw new DriverDomainError(`Invalid driver license category: ${props.licenseCategory}`);
    }

    if (!props.licenseExpiresAt || !(props.licenseExpiresAt instanceof Date) || Number.isNaN(props.licenseExpiresAt.getTime())) {
      throw new DriverDomainError('licenseExpiresAt must be a valid date');
    }

    const now = new Date();
    return new Driver({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      personId: props.personId,
      licenseNumber,
      licenseCategory: props.licenseCategory,
      licenseExpiresAt: props.licenseExpiresAt,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: DriverProps, documents: DriverDocument[] = []): Driver {
    const driver = new Driver(props);
    driver.documents = [...documents];
    return driver;
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get personId(): string {
    return this.props.personId;
  }

  get licenseNumber(): string {
    return this.props.licenseNumber;
  }

  get licenseCategory(): DriverLicenseCategory {
    return this.props.licenseCategory;
  }

  get licenseExpiresAt(): Date {
    return this.props.licenseExpiresAt;
  }

  get status(): DriverStatus {
    return this.props.status;
  }

  get suspensionReason(): string | undefined {
    return this.props.suspensionReason;
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

  get driverDocuments(): DriverDocument[] {
    return [...this.documents];
  }

  update(props: UpdateDriverProps): void {
    let changed = false;

    if (props.licenseCategory !== undefined) {
      if (!VALID_LICENSE_CATEGORIES.has(props.licenseCategory)) {
        throw new DriverDomainError(`Invalid driver license category: ${props.licenseCategory}`);
      }
      this.props.licenseCategory = props.licenseCategory;
      changed = true;
    }

    if (props.licenseExpiresAt !== undefined) {
      if (!(props.licenseExpiresAt instanceof Date) || Number.isNaN(props.licenseExpiresAt.getTime())) {
        throw new DriverDomainError('licenseExpiresAt must be a valid date');
      }
      this.props.licenseExpiresAt = props.licenseExpiresAt;
      changed = true;
    }

    if (changed) {
      this.props.updatedAt = new Date();
    }
  }

  suspend(reason: string): void {
    const trimmed = reason?.trim();
    if (!trimmed || trimmed.length === 0) {
      throw new DriverDomainError('Suspension reason is required');
    }
    this.props.status = 'SUSPENDED';
    this.props.suspensionReason = trimmed;
    this.props.updatedAt = new Date();
  }

  reactivate(): void {
    this.props.status = 'ACTIVE';
    this.props.suspensionReason = undefined;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.status = 'INACTIVE';
    this.props.updatedAt = new Date();
  }

  isLicenseExpired(atDate: Date = new Date()): boolean {
    return this.props.licenseExpiresAt.getTime() < atDate.getTime();
  }

  attachDocument(document: DriverDocument): void {
    if (document.driverId !== this.id) {
      throw new DriverDomainError('Document does not belong to this driver');
    }
    this.documents.push(document);
  }

  toJSON(): DriverProps {
    return { ...this.props };
  }
}
