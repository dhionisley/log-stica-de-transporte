import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresOutboxRepository } from '../../outbox/infrastructure/postgres-outbox.repository';
import {
  ServiceLocation,
} from '../domain/service-location.entity';
import {
  type ILocationRepository,
  type ListLocationsFilter,
  LOCATION_REPOSITORY_TOKEN,
} from '../domain/location.repository';
import {
  type GeoPoint,
  type LocationStatus,
  type LocationType,
  type StructuredAddress,
} from '../domain/location.types';
import { toIntegrationPayload } from '../domain/location.events';
import {
  type IClientCompanyRepository,
  CLIENT_COMPANY_REPOSITORY_TOKEN,
} from '../../clients/domain/client-company.repository';

export interface CreateLocationDto {
  clientCompanyId?: string;
  name: string;
  locationType?: LocationType;
  addressStructured: StructuredAddress;
  point: GeoPoint;
  geofence?: GeoPoint[];
  geofenceRadiusMeters?: number;
}

export interface UpdateLocationDto {
  clientCompanyId?: string;
  name?: string;
  locationType?: LocationType;
  addressStructured?: StructuredAddress;
  point?: GeoPoint;
  geofenceRadiusMeters?: number;
}

export interface UpdateGeofenceDto {
  geofence?: GeoPoint[];
  geofenceRadiusMeters?: number;
}

export interface LocationResponseDto {
  id: string;
  tenantId: string;
  clientCompanyId?: string;
  name: string;
  locationType: LocationType;
  addressStructured: StructuredAddress;
  point: GeoPoint;
  geofence?: GeoPoint[];
  geofenceRadiusMeters?: number;
  status: LocationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface GeofenceEvaluationResponseDto {
  locationId: string;
  isInside: boolean;
  evaluatedPoint: GeoPoint;
  evaluatedAt: string;
}

export class LocationNotFoundError extends Error {
  constructor(id: string) {
    super(`Location not found: ${id}`);
    this.name = 'LocationNotFoundError';
  }
}

export class ClientCompanyNotBelongingError extends Error {
  constructor(clientCompanyId: string) {
    super(`Client company ${clientCompanyId} does not belong to this tenant`);
    this.name = 'ClientCompanyNotBelongingError';
  }
}

function toUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
}

@Injectable()
export class LocationManagementService {
  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
    @Inject(LOCATION_REPOSITORY_TOKEN)
    private readonly repository: ILocationRepository,
    @Inject(CLIENT_COMPANY_REPOSITORY_TOKEN)
    private readonly clientCompanyRepository: IClientCompanyRepository,
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
    dto: CreateLocationDto,
    actorId = 'system',
  ): Promise<LocationResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      if (dto.clientCompanyId) {
        const company = await this.clientCompanyRepository.findById(dto.clientCompanyId, client);
        if (!company || company.tenantId !== tenantId) {
          throw new ClientCompanyNotBelongingError(dto.clientCompanyId);
        }
      }

      const location = ServiceLocation.create({
        tenantId,
        clientCompanyId: dto.clientCompanyId,
        name: dto.name,
        locationType: dto.locationType,
        addressStructured: dto.addressStructured,
        point: dto.point,
        geofence: dto.geofence,
        geofenceRadiusMeters: dto.geofenceRadiusMeters,
      });

      await this.repository.save(location, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'ServiceLocation',
        aggregateId: location.id,
        aggregateVersion: location.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'LocationCreated',
        payload: toIntegrationPayload({
          id: location.id,
          tenantId: location.tenantId,
          name: location.name,
          locationType: location.locationType,
          clientCompanyId: location.clientCompanyId,
          point: location.point,
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
          'LOCATION_CREATED',
          'ServiceLocation',
          location.id,
          JSON.stringify({
            name: location.name,
            locationType: location.locationType,
            clientCompanyId: location.clientCompanyId,
            point: location.point,
            status: location.status,
          }),
        ],
      );

      return this.toLocationDto(location);
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateLocationDto,
    actorId = 'system',
  ): Promise<LocationResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const location = await this.repository.findById(id, client);
      if (!location) {
        throw new LocationNotFoundError(id);
      }

      if (dto.clientCompanyId && dto.clientCompanyId !== location.clientCompanyId) {
        const company = await this.clientCompanyRepository.findById(dto.clientCompanyId, client);
        if (!company || company.tenantId !== tenantId) {
          throw new ClientCompanyNotBelongingError(dto.clientCompanyId);
        }
      }

      const beforeState = {
        name: location.name,
        locationType: location.locationType,
        clientCompanyId: location.clientCompanyId,
        point: location.point,
      };

      location.update({
        name: dto.name,
        clientCompanyId: dto.clientCompanyId,
        locationType: dto.locationType,
        addressStructured: dto.addressStructured,
        point: dto.point,
        geofenceRadiusMeters: dto.geofenceRadiusMeters,
      });

      await this.repository.save(location, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'ServiceLocation',
        aggregateId: location.id,
        aggregateVersion: location.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'LocationUpdated',
        payload: toIntegrationPayload({
          id: location.id,
          tenantId: location.tenantId,
          name: location.name,
          locationType: location.locationType,
          point: location.point,
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
          'LOCATION_UPDATED',
          'ServiceLocation',
          location.id,
          JSON.stringify(beforeState),
          JSON.stringify({
            name: location.name,
            locationType: location.locationType,
            clientCompanyId: location.clientCompanyId,
            point: location.point,
          }),
        ],
      );

      return this.toLocationDto(location);
    });
  }

  async updateGeofence(
    tenantId: string,
    id: string,
    dto: UpdateGeofenceDto,
    actorId = 'system',
  ): Promise<LocationResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const location = await this.repository.findById(id, client);
      if (!location) {
        throw new LocationNotFoundError(id);
      }

      if (dto.geofence) {
        location.setGeofencePolygon(dto.geofence);
      }
      if (dto.geofenceRadiusMeters !== undefined) {
        location.setGeofenceRadius(dto.geofenceRadiusMeters);
      }

      await this.repository.save(location, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'ServiceLocation',
        aggregateId: location.id,
        aggregateVersion: location.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'LocationGeofenceUpdated',
        payload: toIntegrationPayload({
          id: location.id,
          hasGeofencePolygon: !!location.geofence,
          geofenceRadiusMeters: location.geofenceRadiusMeters,
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
          'LOCATION_GEOFENCE_UPDATED',
          'ServiceLocation',
          location.id,
          JSON.stringify({
            geofenceVertices: location.geofence?.length ?? 0,
            geofenceRadiusMeters: location.geofenceRadiusMeters,
          }),
        ],
      );

      return this.toLocationDto(location);
    });
  }

  async findById(tenantId: string, id: string): Promise<LocationResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const location = await this.repository.findById(id, client);
      if (!location) {
        throw new LocationNotFoundError(id);
      }
      return this.toLocationDto(location);
    });
  }

  async list(
    tenantId: string,
    filter?: ListLocationsFilter,
  ): Promise<{ items: LocationResponseDto[]; total: number }> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const result = await this.repository.list(filter, client);
      return {
        items: result.items.map((loc) => this.toLocationDto(loc)),
        total: result.total,
      };
    });
  }

  async findNearby(
    tenantId: string,
    center: GeoPoint,
    radiusMeters: number,
  ): Promise<LocationResponseDto[]> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const items = await this.repository.findNearby(center, radiusMeters, client);
      return items.map((loc) => this.toLocationDto(loc));
    });
  }

  async evaluatePointContainment(
    tenantId: string,
    locationId: string,
    point: GeoPoint,
  ): Promise<GeofenceEvaluationResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const location = await this.repository.findById(locationId, client);
      if (!location) {
        throw new LocationNotFoundError(locationId);
      }

      const isInside = location.containsPoint(point);

      return {
        locationId: location.id,
        isInside,
        evaluatedPoint: point,
        evaluatedAt: new Date().toISOString(),
      };
    });
  }

  private toLocationDto(location: ServiceLocation): LocationResponseDto {
    return {
      id: location.id,
      tenantId: location.tenantId,
      clientCompanyId: location.clientCompanyId,
      name: location.name,
      locationType: location.locationType,
      addressStructured: location.addressStructured,
      point: location.point,
      geofence: location.geofence,
      geofenceRadiusMeters: location.geofenceRadiusMeters,
      status: location.status,
      version: location.version,
      createdAt: location.createdAt.toISOString(),
      updatedAt: location.updatedAt.toISOString(),
    };
  }
}
