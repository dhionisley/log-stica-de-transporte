import type { PoolClient } from 'pg';
import type { Vehicle } from './vehicle.entity';
import type { VehicleDocument } from './vehicle-document.entity';
import type { OperationalStatus, VehicleCategory, VehicleStatus } from './vehicle.types';

export interface ListVehiclesFilter {
  status?: VehicleStatus;
  operationalStatus?: OperationalStatus;
  category?: VehicleCategory;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface IVehicleRepository {
  save(vehicle: Vehicle, client?: PoolClient): Promise<void>;
  findById(id: string, client?: PoolClient): Promise<Vehicle | null>;
  findByPlateNormalized(plateNormalized: string, client?: PoolClient): Promise<Vehicle | null>;
  findByFleetCode(fleetCode: string, client?: PoolClient): Promise<Vehicle | null>;
  list(filter?: ListVehiclesFilter, client?: PoolClient): Promise<{ items: Vehicle[]; total: number }>;

  saveDocument(document: VehicleDocument, client?: PoolClient): Promise<void>;
  findDocumentById(id: string, client?: PoolClient): Promise<VehicleDocument | null>;
  listDocumentsByVehicle(vehicleId: string, client?: PoolClient): Promise<VehicleDocument[]>;
}

export const VEHICLE_REPOSITORY_TOKEN = Symbol('IVehicleRepository');
