import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import {
  ServiceLocation,
  type ServiceLocationProps,
} from '../domain/service-location.entity';
import {
  type ILocationRepository,
  type ListLocationsFilter,
} from '../domain/location.repository';
import {
  type GeoPoint,
  type LocationStatus,
  type LocationType,
  type StructuredAddress,
  LocationDomainError,
} from '../domain/location.types';

interface ServiceLocationRow {
  id: string;
  tenant_id: string;
  client_company_id: string | null;
  name: string;
  location_type: LocationType;
  address_structured: StructuredAddress | string;
  longitude: string | number;
  latitude: string | number;
  geofence_geojson: string | null;
  geofence_radius_meters: string | number | null;
  status: LocationStatus;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PostgresLocationRepository implements ILocationRepository {
  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
  ) {}

  private getRunner(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  async findById(id: string, client?: PoolClient): Promise<ServiceLocation | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<ServiceLocationRow>(
      `SELECT id, tenant_id, client_company_id, name, location_type,
              address_structured,
              ST_X(point::geometry) AS longitude,
              ST_Y(point::geometry) AS latitude,
              ST_AsGeoJSON(geofence) AS geofence_geojson,
              geofence_radius_meters,
              status, version, created_at, updated_at
       FROM service.service_locations
       WHERE id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      return null;
    }

    return this.mapToEntity(res.rows[0]);
  }

  async list(
    filter?: ListLocationsFilter,
    client?: PoolClient,
  ): Promise<{ items: ServiceLocation[]; total: number }> {
    const runner = this.getRunner(client);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filter?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filter.status);
    }

    if (filter?.locationType) {
      conditions.push(`location_type = $${idx++}`);
      values.push(filter.locationType);
    }

    if (filter?.clientCompanyId) {
      conditions.push(`client_company_id = $${idx++}`);
      values.push(filter.clientCompanyId);
    }

    if (filter?.search) {
      conditions.push(`name ILIKE $${idx++}`);
      values.push(`%${filter.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await runner.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM service.service_locations ${whereClause}`,
      values,
    );
    const total = Number.parseInt(countRes.rows[0]?.count ?? '0', 10);

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const query = `
      SELECT id, tenant_id, client_company_id, name, location_type,
             address_structured,
             ST_X(point::geometry) AS longitude,
             ST_Y(point::geometry) AS latitude,
             ST_AsGeoJSON(geofence) AS geofence_geojson,
             geofence_radius_meters,
             status, version, created_at, updated_at
      FROM service.service_locations
      ${whereClause}
      ORDER BY name ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    values.push(limit, offset);
    const rowsRes = await runner.query<ServiceLocationRow>(query, values);
    const items = rowsRes.rows.map((row) => this.mapToEntity(row));

    return { items, total };
  }

  async findNearby(
    center: GeoPoint,
    radiusMeters: number,
    client?: PoolClient,
  ): Promise<ServiceLocation[]> {
    const runner = this.getRunner(client);
    const res = await runner.query<ServiceLocationRow>(
      `SELECT id, tenant_id, client_company_id, name, location_type,
              address_structured,
              ST_X(point::geometry) AS longitude,
              ST_Y(point::geometry) AS latitude,
              ST_AsGeoJSON(geofence) AS geofence_geojson,
              geofence_radius_meters,
              status, version, created_at, updated_at
       FROM service.service_locations
       WHERE status = 'ACTIVE'
         AND ST_DWithin(
           point,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3
         )
       ORDER BY ST_Distance(point, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) ASC`,
      [center.longitude, center.latitude, radiusMeters],
    );

    return res.rows.map((row) => this.mapToEntity(row));
  }

  async save(location: ServiceLocation, client?: PoolClient): Promise<void> {
    const runner = this.getRunner(client);

    const existing = await runner.query<{ version: string | number }>(
      `SELECT version FROM service.service_locations WHERE id = $1`,
      [location.id],
    );

    const geofenceGeoJson = location.geofence
      ? JSON.stringify({
          type: 'Polygon',
          coordinates: [
            location.geofence.map((pt) => [pt.longitude, pt.latitude]),
          ],
        })
      : null;

    if (existing.rows.length === 0) {
      await runner.query(
        `INSERT INTO service.service_locations (
           id, tenant_id, client_company_id, name, location_type,
           address_structured, point, geofence, geofence_radius_meters,
           status, version, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6::jsonb,
           ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography,
           CASE WHEN $9::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON($9), 4326)::geography ELSE NULL END,
           $10, $11, $12, $13, $14
         )`,
        [
          location.id,
          location.tenantId,
          location.clientCompanyId ?? null,
          location.name,
          location.locationType,
          JSON.stringify(location.addressStructured),
          location.point.longitude,
          location.point.latitude,
          geofenceGeoJson,
          location.geofenceRadiusMeters ?? null,
          location.status,
          location.version,
          location.createdAt,
          location.updatedAt,
        ],
      );
    } else {
      const updateRes = await runner.query(
        `UPDATE service.service_locations SET
           client_company_id = $1,
           name = $2,
           location_type = $3,
           address_structured = $4::jsonb,
           point = ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
           geofence = CASE WHEN $7::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON($7), 4326)::geography ELSE NULL END,
           geofence_radius_meters = $8,
           status = $9,
           version = version + 1,
           updated_at = $10
         WHERE id = $11 AND tenant_id = $12 AND version = $13
         RETURNING version`,
        [
          location.clientCompanyId ?? null,
          location.name,
          location.locationType,
          JSON.stringify(location.addressStructured),
          location.point.longitude,
          location.point.latitude,
          geofenceGeoJson,
          location.geofenceRadiusMeters ?? null,
          location.status,
          location.updatedAt,
          location.id,
          location.tenantId,
          location.version,
        ],
      );

      if (updateRes.rowCount === 0) {
        throw new LocationDomainError(
          `Location optimistic lock conflict for id ${location.id} (version ${location.version})`,
        );
      }
    }
  }

  private mapToEntity(row: ServiceLocationRow): ServiceLocation {
    const address =
      typeof row.address_structured === 'string'
        ? JSON.parse(row.address_structured)
        : row.address_structured;

    let geofence: GeoPoint[] | undefined;
    if (row.geofence_geojson) {
      try {
        const parsed = JSON.parse(row.geofence_geojson);
        if (parsed.type === 'Polygon' && Array.isArray(parsed.coordinates?.[0])) {
          geofence = parsed.coordinates[0].map((coord: [number, number]) => ({
            latitude: coord[1],
            longitude: coord[0],
          }));
        }
      } catch {
        geofence = undefined;
      }
    }

    const props: ServiceLocationProps = {
      id: row.id,
      tenantId: row.tenant_id,
      clientCompanyId: row.client_company_id ?? undefined,
      name: row.name,
      locationType: row.location_type,
      addressStructured: address,
      point: {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      },
      geofence,
      geofenceRadiusMeters:
        row.geofence_radius_meters !== null && row.geofence_radius_meters !== undefined
          ? Number(row.geofence_radius_meters)
          : undefined,
      status: row.status,
      version: Number(row.version),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };

    return ServiceLocation.reconstitute(props);
  }
}
