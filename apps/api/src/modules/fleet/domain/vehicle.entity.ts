import { randomUUID } from 'node:crypto';
import {
  type OperationalStatus,
  type VehicleCategory,
  type VehicleStatus,
  VehicleDomainError,
  normalizePlate,
  validatePlate,
} from './vehicle.types';
import type { VehicleDocument } from './vehicle-document.entity';

export interface VehicleProps {
  id: string;
  tenantId: string;
  fleetCode: string;
  plate: string;
  plateNormalized: string;
  category: VehicleCategory;
  capacity: number;
  accessibilityFeatures: string[];
  odometerKm: number;
  status: VehicleStatus;
  operationalStatus: OperationalStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVehicleProps {
  id?: string;
  tenantId: string;
  fleetCode: string;
  plate: string;
  category?: VehicleCategory;
  capacity: number;
  accessibilityFeatures?: string[];
  odometerKm?: number;
}

export interface UpdateVehicleProps {
  fleetCode?: string;
  category?: VehicleCategory;
  capacity?: number;
  accessibilityFeatures?: string[];
  odometerKm?: number;
}

export class Vehicle {
  private documents: VehicleDocument[] = [];

  private constructor(private props: VehicleProps) {}

  static create(props: CreateVehicleProps): Vehicle {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new VehicleDomainError('tenantId is required');
    }
    const fleetCode = props.fleetCode?.trim();
    if (!fleetCode || fleetCode.length === 0) {
      throw new VehicleDomainError('fleetCode is required');
    }

    const plateNormalized = normalizePlate(props.plate);
    if (!validatePlate(plateNormalized)) {
      throw new VehicleDomainError(`Invalid vehicle plate format: ${props.plate}`);
    }

    if (!props.capacity || props.capacity <= 0) {
      throw new VehicleDomainError('capacity must be a positive integer');
    }

    const odometerKm = props.odometerKm ?? 0;
    if (odometerKm < 0) {
      throw new VehicleDomainError('odometerKm cannot be negative');
    }

    const now = new Date();
    return new Vehicle({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      fleetCode,
      plate: props.plate.trim(),
      plateNormalized,
      category: props.category ?? 'BUS',
      capacity: Math.floor(props.capacity),
      accessibilityFeatures: props.accessibilityFeatures ?? [],
      odometerKm,
      status: 'ACTIVE',
      operationalStatus: 'AVAILABLE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: VehicleProps, documents: VehicleDocument[] = []): Vehicle {
    const vehicle = new Vehicle(props);
    vehicle.documents = [...documents];
    return vehicle;
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get fleetCode(): string {
    return this.props.fleetCode;
  }

  get plate(): string {
    return this.props.plate;
  }

  get plateNormalized(): string {
    return this.props.plateNormalized;
  }

  get category(): VehicleCategory {
    return this.props.category;
  }

  get capacity(): number {
    return this.props.capacity;
  }

  get accessibilityFeatures(): string[] {
    return [...this.props.accessibilityFeatures];
  }

  get odometerKm(): number {
    return this.props.odometerKm;
  }

  get status(): VehicleStatus {
    return this.props.status;
  }

  get operationalStatus(): OperationalStatus {
    return this.props.operationalStatus;
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

  get vehicleDocuments(): VehicleDocument[] {
    return [...this.documents];
  }

  update(props: UpdateVehicleProps): void {
    let changed = false;

    if (props.fleetCode !== undefined) {
      const code = props.fleetCode.trim();
      if (!code) {
        throw new VehicleDomainError('fleetCode cannot be empty');
      }
      this.props.fleetCode = code;
      changed = true;
    }

    if (props.category !== undefined) {
      this.props.category = props.category;
      changed = true;
    }

    if (props.capacity !== undefined) {
      if (props.capacity <= 0) {
        throw new VehicleDomainError('capacity must be a positive integer');
      }
      this.props.capacity = Math.floor(props.capacity);
      changed = true;
    }

    if (props.accessibilityFeatures !== undefined) {
      this.props.accessibilityFeatures = [...props.accessibilityFeatures];
      changed = true;
    }

    if (props.odometerKm !== undefined) {
      if (props.odometerKm < this.props.odometerKm) {
        throw new VehicleDomainError('odometerKm cannot decrease');
      }
      this.props.odometerKm = props.odometerKm;
      changed = true;
    }

    if (changed) {
      this.props.updatedAt = new Date();
    }
  }

  setOperationalStatus(status: OperationalStatus): void {
    if (this.props.status === 'INACTIVE' && status === 'AVAILABLE') {
      throw new VehicleDomainError('Inactive vehicle cannot be made available');
    }
    this.props.operationalStatus = status;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.status = 'INACTIVE';
    this.props.operationalStatus = 'OUT_OF_SERVICE';
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.status = 'ACTIVE';
    this.props.operationalStatus = 'AVAILABLE';
    this.props.updatedAt = new Date();
  }

  attachDocument(document: VehicleDocument): void {
    if (document.vehicleId !== this.id) {
      throw new VehicleDomainError('Document does not belong to this vehicle');
    }
    this.documents.push(document);
  }

  toJSON(): VehicleProps {
    return {
      ...this.props,
      accessibilityFeatures: [...this.props.accessibilityFeatures],
    };
  }
}
