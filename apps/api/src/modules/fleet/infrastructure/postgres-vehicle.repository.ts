import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import {
  Vehicle,
  type VehicleProps,
} from '../domain/vehicle.entity';
import {
  VehicleDocument,
  type VehicleDocumentProps,
} from '../domain/vehicle-document.entity';
import {
  type IVehicleRepository,
  type ListVehiclesFilter,
} from '../domain/vehicle.repository';
import {
  type DocumentStatus,
  type OperationalStatus,
  type VehicleCategory,
  type VehicleStatus,
  VehicleDomainError,
} from '../domain/vehicle.types';

interface VehicleRow {
  id: string;
  tenant_id: string;
  fleet_code: string;
  plate: string;
  plate_normalized: string;
  category: VehicleCategory;
  capacity: number;
  accessibility_features: string[] | string;
  odometer_km: number;
  status: VehicleStatus;
  operational_status: OperationalStatus;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

interface VehicleDocumentRow {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  document_type: string;
  document_number: string;
  expires_at?: Date | null;
  status: DocumentStatus;
  metadata: Record<string, unknown> | string;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PostgresVehicleRepository implements IVehicleRepository {
  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
  ) {}

  private getRunner(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  async findById(id: string, client?: PoolClient): Promise<Vehicle | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<VehicleRow>(
      `SELECT id, tenant_id, fleet_code, plate, plate_normalized, category,
              capacity, accessibility_features, odometer_km, status,
              operational_status, version, created_at, updated_at
       FROM fleet.vehicles
       WHERE id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const docs = await this.listDocumentsByVehicle(id, client);
    return this.mapVehicleToEntity(res.rows[0], docs);
  }

  async findByPlateNormalized(plateNormalized: string, client?: PoolClient): Promise<Vehicle | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<VehicleRow>(
      `SELECT id, tenant_id, fleet_code, plate, plate_normalized, category,
              capacity, accessibility_features, odometer_km, status,
              operational_status, version, created_at, updated_at
       FROM fleet.vehicles
       WHERE plate_normalized = $1`,
      [plateNormalized],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const docs = await this.listDocumentsByVehicle(res.rows[0].id, client);
    return this.mapVehicleToEntity(res.rows[0], docs);
  }

  async findByFleetCode(fleetCode: string, client?: PoolClient): Promise<Vehicle | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<VehicleRow>(
      `SELECT id, tenant_id, fleet_code, plate, plate_normalized, category,
              capacity, accessibility_features, odometer_km, status,
              operational_status, version, created_at, updated_at
       FROM fleet.vehicles
       WHERE fleet_code = $1`,
      [fleetCode],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const docs = await this.listDocumentsByVehicle(res.rows[0].id, client);
    return this.mapVehicleToEntity(res.rows[0], docs);
  }

  async list(
    filter?: ListVehiclesFilter,
    client?: PoolClient,
  ): Promise<{ items: Vehicle[]; total: number }> {
    const runner = this.getRunner(client);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filter?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filter.status);
    }

    if (filter?.operationalStatus) {
      conditions.push(`operational_status = $${idx++}`);
      values.push(filter.operationalStatus);
    }

    if (filter?.category) {
      conditions.push(`category = $${idx++}`);
      values.push(filter.category);
    }

    if (filter?.search) {
      conditions.push(`(plate_normalized ILIKE $${idx} OR fleet_code ILIKE $${idx})`);
      values.push(`%${filter.search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await runner.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM fleet.vehicles ${whereClause}`,
      values,
    );
    const total = Number.parseInt(countRes.rows[0]?.count ?? '0', 10);

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const query = `
      SELECT id, tenant_id, fleet_code, plate, plate_normalized, category,
             capacity, accessibility_features, odometer_km, status,
             operational_status, version, created_at, updated_at
      FROM fleet.vehicles
      ${whereClause}
      ORDER BY fleet_code ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    values.push(limit, offset);
    const rowsRes = await runner.query<VehicleRow>(query, values);
    const items = rowsRes.rows.map((row) => this.mapVehicleToEntity(row, []));

    return { items, total };
  }

  async save(vehicle: Vehicle, client?: PoolClient): Promise<void> {
    const runner = this.getRunner(client);

    const existing = await runner.query<{ version: string | number }>(
      `SELECT version FROM fleet.vehicles WHERE id = $1`,
      [vehicle.id],
    );

    if (existing.rows.length === 0) {
      await runner.query(
        `INSERT INTO fleet.vehicles (
           id, tenant_id, fleet_code, plate, plate_normalized, category,
           capacity, accessibility_features, odometer_km, status,
           operational_status, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)`,
        [
          vehicle.id,
          vehicle.tenantId,
          vehicle.fleetCode,
          vehicle.plate,
          vehicle.plateNormalized,
          vehicle.category,
          vehicle.capacity,
          JSON.stringify(vehicle.accessibilityFeatures),
          vehicle.odometerKm,
          vehicle.status,
          vehicle.operationalStatus,
          vehicle.version,
          vehicle.createdAt,
          vehicle.updatedAt,
        ],
      );
    } else {
      const updateRes = await runner.query(
        `UPDATE fleet.vehicles SET
           fleet_code = $1,
           category = $2,
           capacity = $3,
           accessibility_features = $4::jsonb,
           odometer_km = $5,
           status = $6,
           operational_status = $7,
           version = version + 1,
           updated_at = $8
         WHERE id = $9 AND tenant_id = $10 AND version = $11
         RETURNING version`,
        [
          vehicle.fleetCode,
          vehicle.category,
          vehicle.capacity,
          JSON.stringify(vehicle.accessibilityFeatures),
          vehicle.odometerKm,
          vehicle.status,
          vehicle.operationalStatus,
          vehicle.updatedAt,
          vehicle.id,
          vehicle.tenantId,
          vehicle.version,
        ],
      );

      if (updateRes.rowCount === 0) {
        throw new VehicleDomainError(
          `Vehicle optimistic lock conflict for id ${vehicle.id} (version ${vehicle.version})`,
        );
      }
    }
  }

  async saveDocument(document: VehicleDocument, client?: PoolClient): Promise<void> {
    const runner = this.getRunner(client);

    const existing = await runner.query<{ version: string | number }>(
      `SELECT version FROM fleet.vehicle_documents WHERE id = $1`,
      [document.id],
    );

    if (existing.rows.length === 0) {
      await runner.query(
        `INSERT INTO fleet.vehicle_documents (
           id, tenant_id, vehicle_id, document_type, document_number,
           expires_at, status, metadata, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
        [
          document.id,
          document.tenantId,
          document.vehicleId,
          document.documentType,
          document.documentNumber,
          document.expiresAt ?? null,
          document.status,
          JSON.stringify(document.metadata),
          document.version,
          document.createdAt,
          document.updatedAt,
        ],
      );
    } else {
      await runner.query(
        `UPDATE fleet.vehicle_documents SET
           document_type = $1,
           document_number = $2,
           expires_at = $3,
           status = $4,
           metadata = $5::jsonb,
           version = version + 1,
           updated_at = $6
         WHERE id = $7 AND tenant_id = $8`,
        [
          document.documentType,
          document.documentNumber,
          document.expiresAt ?? null,
          document.status,
          JSON.stringify(document.metadata),
          document.updatedAt,
          document.id,
          document.tenantId,
        ],
      );
    }
  }

  async findDocumentById(id: string, client?: PoolClient): Promise<VehicleDocument | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<VehicleDocumentRow>(
      `SELECT id, tenant_id, vehicle_id, document_type, document_number,
              expires_at, status, metadata, version, created_at, updated_at
       FROM fleet.vehicle_documents
       WHERE id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      return null;
    }

    return this.mapDocumentToEntity(res.rows[0]);
  }

  async listDocumentsByVehicle(vehicleId: string, client?: PoolClient): Promise<VehicleDocument[]> {
    const runner = this.getRunner(client);
    const res = await runner.query<VehicleDocumentRow>(
      `SELECT id, tenant_id, vehicle_id, document_type, document_number,
              expires_at, status, metadata, version, created_at, updated_at
       FROM fleet.vehicle_documents
       WHERE vehicle_id = $1
       ORDER BY created_at ASC`,
      [vehicleId],
    );

    return res.rows.map((row) => this.mapDocumentToEntity(row));
  }

  private mapVehicleToEntity(row: VehicleRow, docs: VehicleDocument[]): Vehicle {
    const accessibilityFeatures =
      typeof row.accessibility_features === 'string'
        ? JSON.parse(row.accessibility_features)
        : (row.accessibility_features ?? []);

    const props: VehicleProps = {
      id: row.id,
      tenantId: row.tenant_id,
      fleetCode: row.fleet_code,
      plate: row.plate,
      plateNormalized: row.plate_normalized,
      category: row.category,
      capacity: Number(row.capacity),
      accessibilityFeatures,
      odometerKm: Number(row.odometer_km),
      status: row.status,
      operationalStatus: row.operational_status,
      version: Number(row.version),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };

    return Vehicle.reconstitute(props, docs);
  }

  private mapDocumentToEntity(row: VehicleDocumentRow): VehicleDocument {
    const metadata =
      typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : (row.metadata ?? {});

    const props: VehicleDocumentProps = {
      id: row.id,
      tenantId: row.tenant_id,
      vehicleId: row.vehicle_id,
      documentType: row.document_type,
      documentNumber: row.document_number,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      status: row.status,
      metadata,
      version: Number(row.version),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };

    return VehicleDocument.reconstitute(props);
  }
}
