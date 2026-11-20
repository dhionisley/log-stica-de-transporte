import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresOutboxRepository } from '../../outbox/infrastructure/postgres-outbox.repository';
import {
  Vehicle,
} from '../domain/vehicle.entity';
import {
  VehicleDocument,
} from '../domain/vehicle-document.entity';
import {
  type IVehicleRepository,
  type ListVehiclesFilter,
  VEHICLE_REPOSITORY_TOKEN,
} from '../domain/vehicle.repository';
import {
  type DocumentStatus,
  type OperationalStatus,
  type VehicleCategory,
  type VehicleStatus,
  normalizePlate,
} from '../domain/vehicle.types';
import { toIntegrationPayload } from '../domain/fleet.events';
import { EligibilityService, type EligibilityEvaluationResult } from '../domain/eligibility.service';
import {
  type IWorkforceRepository,
  WORKFORCE_REPOSITORY_TOKEN,
} from '../../workforce/domain/workforce.repository';

export interface CreateVehicleDto {
  fleetCode: string;
  plate: string;
  category?: VehicleCategory;
  capacity: number;
  accessibilityFeatures?: string[];
  odometerKm?: number;
}

export interface UpdateVehicleDto {
  fleetCode?: string;
  category?: VehicleCategory;
  capacity?: number;
  accessibilityFeatures?: string[];
  odometerKm?: number;
}

export interface AttachVehicleDocumentDto {
  documentType: string;
  documentNumber: string;
  expiresAt?: Date | string;
  metadata?: Record<string, unknown>;
}

export interface VehicleResponseDto {
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
  createdAt: string;
  updatedAt: string;
  documents?: VehicleDocumentResponseDto[];
}

export interface VehicleDocumentResponseDto {
  id: string;
  tenantId: string;
  vehicleId: string;
  documentType: string;
  documentNumber: string;
  expiresAt?: string;
  status: DocumentStatus;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class VehicleNotFoundError extends Error {
  constructor(id: string) {
    super(`Vehicle not found: ${id}`);
    this.name = 'VehicleNotFoundError';
  }
}

export class VehiclePlateConflictError extends Error {
  constructor(plate: string) {
    super(`Vehicle with plate "${plate}" already exists in this tenant`);
    this.name = 'VehiclePlateConflictError';
  }
}

export class VehicleFleetCodeConflictError extends Error {
  constructor(fleetCode: string) {
    super(`Vehicle with fleet code "${fleetCode}" already exists in this tenant`);
    this.name = 'VehicleFleetCodeConflictError';
  }
}

function toUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
}

@Injectable()
export class VehicleManagementService {
  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
    @Inject(VEHICLE_REPOSITORY_TOKEN)
    private readonly repository: IVehicleRepository,
    @Inject(WORKFORCE_REPOSITORY_TOKEN)
    private readonly workforceRepository: IWorkforceRepository,
    private readonly outboxRepository: PostgresOutboxRepository,
  ) {}

  private async withTenantTransaction<T>(
    tenantId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async create(
    tenantId: string,
    dto: CreateVehicleDto,
    actorId = 'system',
  ): Promise<VehicleResponseDto> {
    const normalizedPlate = normalizePlate(dto.plate);

    return this.withTenantTransaction(tenantId, async (client) => {
      const existingPlate = await this.repository.findByPlateNormalized(normalizedPlate, client);
      if (existingPlate) {
        throw new VehiclePlateConflictError(dto.plate);
      }

      const existingCode = await this.repository.findByFleetCode(dto.fleetCode, client);
      if (existingCode) {
        throw new VehicleFleetCodeConflictError(dto.fleetCode);
      }

      const vehicle = Vehicle.create({
        tenantId,
        fleetCode: dto.fleetCode,
        plate: dto.plate,
        category: dto.category,
        capacity: dto.capacity,
        accessibilityFeatures: dto.accessibilityFeatures,
        odometerKm: dto.odometerKm,
      });

      await this.repository.save(vehicle, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Vehicle',
        aggregateId: vehicle.id,
        aggregateVersion: vehicle.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'VehicleCreated',
        payload: toIntegrationPayload({
          id: vehicle.id,
          tenantId: vehicle.tenantId,
          fleetCode: vehicle.fleetCode,
          plate: vehicle.plate,
          plateNormalized: vehicle.plateNormalized,
          category: vehicle.category,
          capacity: vehicle.capacity,
          operationalStatus: vehicle.operationalStatus,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'VEHICLE_CREATED',
          'Vehicle',
          vehicle.id,
          JSON.stringify({
            fleetCode: vehicle.fleetCode,
            plate: vehicle.plate,
            category: vehicle.category,
            capacity: vehicle.capacity,
            operationalStatus: vehicle.operationalStatus,
          }),
        ],
      );

      return this.toVehicleDto(vehicle);
    });
  }

  async update(
    tenantId: string,
    vehicleId: string,
    dto: UpdateVehicleDto,
    actorId = 'system',
  ): Promise<VehicleResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const vehicle = await this.repository.findById(vehicleId, client);
      if (!vehicle) {
        throw new VehicleNotFoundError(vehicleId);
      }

      if (dto.fleetCode && dto.fleetCode !== vehicle.fleetCode) {
        const existingCode = await this.repository.findByFleetCode(dto.fleetCode, client);
        if (existingCode && existingCode.id !== vehicle.id) {
          throw new VehicleFleetCodeConflictError(dto.fleetCode);
        }
      }

      const beforeState = {
        fleetCode: vehicle.fleetCode,
        category: vehicle.category,
        capacity: vehicle.capacity,
        odometerKm: vehicle.odometerKm,
      };

      vehicle.update({
        fleetCode: dto.fleetCode,
        category: dto.category,
        capacity: dto.capacity,
        accessibilityFeatures: dto.accessibilityFeatures,
        odometerKm: dto.odometerKm,
      });

      await this.repository.save(vehicle, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Vehicle',
        aggregateId: vehicle.id,
        aggregateVersion: vehicle.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'VehicleUpdated',
        payload: toIntegrationPayload({
          id: vehicle.id,
          tenantId: vehicle.tenantId,
          fleetCode: vehicle.fleetCode,
          category: vehicle.category,
          capacity: vehicle.capacity,
          odometerKm: vehicle.odometerKm,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, before_state, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'VEHICLE_UPDATED',
          'Vehicle',
          vehicle.id,
          JSON.stringify(beforeState),
          JSON.stringify({
            fleetCode: vehicle.fleetCode,
            category: vehicle.category,
            capacity: vehicle.capacity,
            odometerKm: vehicle.odometerKm,
          }),
        ],
      );

      return this.toVehicleDto(vehicle);
    });
  }

  async changeOperationalStatus(
    tenantId: string,
    vehicleId: string,
    operationalStatus: OperationalStatus,
    reason?: string,
    actorId = 'system',
  ): Promise<VehicleResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const vehicle = await this.repository.findById(vehicleId, client);
      if (!vehicle) {
        throw new VehicleNotFoundError(vehicleId);
      }

      const beforeStatus = vehicle.operationalStatus;
      vehicle.setOperationalStatus(operationalStatus);

      await this.repository.save(vehicle, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Vehicle',
        aggregateId: vehicle.id,
        aggregateVersion: vehicle.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'VehicleOperationalStatusChanged',
        payload: toIntegrationPayload({
          id: vehicle.id,
          previousStatus: beforeStatus,
          newStatus: vehicle.operationalStatus,
          reason,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, before_state, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'VEHICLE_STATUS_CHANGED',
          'Vehicle',
          vehicle.id,
          JSON.stringify({ operationalStatus: beforeStatus }),
          JSON.stringify({ operationalStatus: vehicle.operationalStatus, reason }),
        ],
      );

      return this.toVehicleDto(vehicle);
    });
  }

  async attachDocument(
    tenantId: string,
    vehicleId: string,
    dto: AttachVehicleDocumentDto,
    actorId = 'system',
  ): Promise<VehicleDocumentResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const vehicle = await this.repository.findById(vehicleId, client);
      if (!vehicle) {
        throw new VehicleNotFoundError(vehicleId);
      }

      const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
      const document = VehicleDocument.create({
        tenantId,
        vehicleId,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
        expiresAt,
        metadata: dto.metadata,
      });

      await this.repository.saveDocument(document, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Vehicle',
        aggregateId: vehicle.id,
        aggregateVersion: vehicle.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'VehicleDocumentAttached',
        payload: toIntegrationPayload({
          id: document.id,
          vehicleId: document.vehicleId,
          documentType: document.documentType,
          documentNumber: document.documentNumber,
          status: document.status,
          expiresAt: document.expiresAt?.toISOString(),
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'VEHICLE_DOCUMENT_ATTACHED',
          'VehicleDocument',
          document.id,
          JSON.stringify({
            vehicleId,
            documentType: document.documentType,
            documentNumber: document.documentNumber,
            status: document.status,
          }),
        ],
      );

      return this.toVehicleDocumentDto(document);
    });
  }

  async findById(tenantId: string, id: string): Promise<VehicleResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const vehicle = await this.repository.findById(id, client);
      if (!vehicle) {
        throw new VehicleNotFoundError(id);
      }
      return this.toVehicleDto(vehicle);
    });
  }

  async list(tenantId: string, filter?: ListVehiclesFilter): Promise<{ items: VehicleResponseDto[]; total: number }> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const result = await this.repository.list(filter, client);
      return {
        items: result.items.map((v) => this.toVehicleDto(v)),
        total: result.total,
      };
    });
  }

  async evaluateEligibility(
    tenantId: string,
    vehicleId: string,
    driverId?: string,
    atDate: Date = new Date(),
  ): Promise<EligibilityEvaluationResult> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const vehicle = await this.repository.findById(vehicleId, client);
      if (!vehicle) {
        throw new VehicleNotFoundError(vehicleId);
      }

      if (!driverId) {
        return EligibilityService.evaluateVehicle(vehicle, atDate);
      }

      const driver = await this.workforceRepository.findDriverById(driverId, client);
      if (!driver) {
        return {
          isEligible: false,
          evaluatedAt: atDate,
          reasons: ['DRIVER_NOT_FOUND'],
          vehicleId: vehicle.id,
        };
      }

      const evalResult = EligibilityService.evaluatePair(driver, vehicle, atDate);

      // Registra avaliação de elegibilidade para fins regulatórios e auditoria
      await this.workforceRepository.saveDriverEligibility(
        {
          tenantId,
          driverId: driver.id,
          evaluatedAt: atDate,
          isEligible: evalResult.isEligible,
          reasons: evalResult.reasons,
        },
        client,
      );

      return evalResult;
    });
  }

  private toVehicleDto(vehicle: Vehicle): VehicleResponseDto {
    return {
      id: vehicle.id,
      tenantId: vehicle.tenantId,
      fleetCode: vehicle.fleetCode,
      plate: vehicle.plate,
      plateNormalized: vehicle.plateNormalized,
      category: vehicle.category,
      capacity: vehicle.capacity,
      accessibilityFeatures: vehicle.accessibilityFeatures,
      odometerKm: vehicle.odometerKm,
      status: vehicle.status,
      operationalStatus: vehicle.operationalStatus,
      version: vehicle.version,
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
      documents: vehicle.vehicleDocuments.map((doc) => this.toVehicleDocumentDto(doc)),
    };
  }

  private toVehicleDocumentDto(doc: VehicleDocument): VehicleDocumentResponseDto {
    return {
      id: doc.id,
      tenantId: doc.tenantId,
      vehicleId: doc.vehicleId,
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      expiresAt: doc.expiresAt?.toISOString(),
      status: doc.status,
      metadata: doc.metadata,
      version: doc.version,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
