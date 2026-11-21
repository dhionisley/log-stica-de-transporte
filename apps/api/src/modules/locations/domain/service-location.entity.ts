import { randomUUID } from 'node:crypto';
import {
  type GeoPoint,
  type LocationStatus,
  type LocationType,
  type StructuredAddress,
  LocationDomainError,
  calculateHaversineDistanceMeters,
  isPointInPolygon,
  validateGeoPoint,
  validateGeofencePolygon,
} from './location.types';

export interface ServiceLocationProps {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceLocationProps {
  id?: string;
  tenantId: string;
  clientCompanyId?: string;
  name: string;
  locationType?: LocationType;
  addressStructured: StructuredAddress;
  point: GeoPoint;
  geofence?: GeoPoint[];
  geofenceRadiusMeters?: number;
}

export interface UpdateServiceLocationProps {
  clientCompanyId?: string;
  name?: string;
  locationType?: LocationType;
  addressStructured?: StructuredAddress;
  point?: GeoPoint;
  geofence?: GeoPoint[];
  geofenceRadiusMeters?: number;
}

export class ServiceLocation {
  private constructor(private props: ServiceLocationProps) {}

  static create(props: CreateServiceLocationProps): ServiceLocation {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new LocationDomainError('tenantId is required');
    }

    const name = props.name?.trim();
    if (!name || name.length === 0) {
      throw new LocationDomainError('name is required');
    }

    if (!props.point || !validateGeoPoint(props.point)) {
      throw new LocationDomainError('Invalid geographic coordinates (WGS 84)');
    }

    if (props.geofence && !validateGeofencePolygon(props.geofence)) {
      throw new LocationDomainError('Geofence polygon must be a closed ring with at least 4 vertices');
    }

    if (props.geofenceRadiusMeters !== undefined && props.geofenceRadiusMeters <= 0) {
      throw new LocationDomainError('geofenceRadiusMeters must be positive');
    }

    const now = new Date();
    return new ServiceLocation({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      clientCompanyId: props.clientCompanyId,
      name,
      locationType: props.locationType ?? 'CLIENT_SITE',
      addressStructured: { ...props.addressStructured },
      point: { ...props.point },
      geofence: props.geofence ? [...props.geofence] : undefined,
      geofenceRadiusMeters: props.geofenceRadiusMeters,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ServiceLocationProps): ServiceLocation {
    return new ServiceLocation(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get clientCompanyId(): string | undefined {
    return this.props.clientCompanyId;
  }

  get name(): string {
    return this.props.name;
  }

  get locationType(): LocationType {
    return this.props.locationType;
  }

  get addressStructured(): StructuredAddress {
    return { ...this.props.addressStructured };
  }

  get point(): GeoPoint {
    return { ...this.props.point };
  }

  get geofence(): GeoPoint[] | undefined {
    return this.props.geofence ? [...this.props.geofence] : undefined;
  }

  get geofenceRadiusMeters(): number | undefined {
    return this.props.geofenceRadiusMeters;
  }

  get status(): LocationStatus {
    return this.props.status;
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

  update(props: UpdateServiceLocationProps): void {
    let changed = false;

    if (props.name !== undefined) {
      const name = props.name.trim();
      if (!name) {
        throw new LocationDomainError('name cannot be empty');
      }
      this.props.name = name;
      changed = true;
    }

    if (props.clientCompanyId !== undefined) {
      this.props.clientCompanyId = props.clientCompanyId || undefined;
      changed = true;
    }

    if (props.locationType !== undefined) {
      this.props.locationType = props.locationType;
      changed = true;
    }

    if (props.addressStructured !== undefined) {
      this.props.addressStructured = { ...props.addressStructured };
      changed = true;
    }

    if (props.point !== undefined) {
      if (!validateGeoPoint(props.point)) {
        throw new LocationDomainError('Invalid geographic coordinates (WGS 84)');
      }
      this.props.point = { ...props.point };
      changed = true;
    }

    if (props.geofence !== undefined) {
      if (props.geofence && !validateGeofencePolygon(props.geofence)) {
        throw new LocationDomainError('Geofence polygon must be a closed ring with at least 4 vertices');
      }
      this.props.geofence = props.geofence ? [...props.geofence] : undefined;
      changed = true;
    }

    if (props.geofenceRadiusMeters !== undefined) {
      if (props.geofenceRadiusMeters !== undefined && props.geofenceRadiusMeters <= 0) {
        throw new LocationDomainError('geofenceRadiusMeters must be positive');
      }
      this.props.geofenceRadiusMeters = props.geofenceRadiusMeters;
      changed = true;
    }

    if (changed) {
      this.props.updatedAt = new Date();
    }
  }

  setGeofencePolygon(polygon: GeoPoint[]): void {
    if (!validateGeofencePolygon(polygon)) {
      throw new LocationDomainError('Geofence polygon must be a closed ring with at least 4 vertices');
    }
    this.props.geofence = [...polygon];
    this.props.updatedAt = new Date();
  }

  setGeofenceRadius(radiusMeters: number): void {
    if (radiusMeters <= 0) {
      throw new LocationDomainError('Radius in meters must be positive');
    }
    this.props.geofenceRadiusMeters = radiusMeters;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.status = 'INACTIVE';
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.status = 'ACTIVE';
    this.props.updatedAt = new Date();
  }

  /**
   * Avalia se uma coordenada está dentro da geofence do local:
   * 1. Se houver polígono geofence configurado, usa contenção de polígono (Ray-Casting).
   * 2. Se houver raio circular configurado, calcula distância geodésica em metros (Haversine).
   * 3. Se nenhum perímetro estiver definido, adota raio padrão de 100m do ponto central.
   */
  containsPoint(point: GeoPoint): boolean {
    if (!validateGeoPoint(point)) {
      return false;
    }

    if (this.props.geofence && this.props.geofence.length >= 4) {
      return isPointInPolygon(point, this.props.geofence);
    }

    const radius = this.props.geofenceRadiusMeters ?? 100;
    const distance = calculateHaversineDistanceMeters(this.props.point, point);
    return distance <= radius;
  }

  toJSON(): ServiceLocationProps {
    return {
      ...this.props,
      addressStructured: { ...this.props.addressStructured },
      point: { ...this.props.point },
      geofence: this.props.geofence ? [...this.props.geofence] : undefined,
    };
  }
}
