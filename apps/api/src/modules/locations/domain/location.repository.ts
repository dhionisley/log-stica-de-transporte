import type { PoolClient } from 'pg';
import type { ServiceLocation } from './service-location.entity';
import type { GeoPoint, LocationStatus, LocationType } from './location.types';

export interface ListLocationsFilter {
  status?: LocationStatus;
  locationType?: LocationType;
  clientCompanyId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ILocationRepository {
  save(location: ServiceLocation, client?: PoolClient): Promise<void>;
  findById(id: string, client?: PoolClient): Promise<ServiceLocation | null>;
  list(filter?: ListLocationsFilter, client?: PoolClient): Promise<{ items: ServiceLocation[]; total: number }>;
  findNearby(center: GeoPoint, radiusMeters: number, client?: PoolClient): Promise<ServiceLocation[]>;
}

export const LOCATION_REPOSITORY_TOKEN = Symbol('ILocationRepository');
