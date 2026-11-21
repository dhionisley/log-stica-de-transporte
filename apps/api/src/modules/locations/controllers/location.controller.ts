import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  LocationManagementService,
  LocationNotFoundError,
  ClientCompanyNotBelongingError,
  type LocationResponseDto,
  type GeofenceEvaluationResponseDto,
} from '../application/location-management.service';
import { LocationDomainError } from '../domain/location.types';

const geoPointSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

const structuredAddressSchema = z.object({
  street: z.string().trim().min(1),
  number: z.string().trim().min(1),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().length(2),
  postalCode: z.string().trim().min(8),
  country: z.string().trim().optional(),
});

const createLocationSchema = z.object({
  clientCompanyId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(255),
  locationType: z.enum(['CLIENT_SITE', 'OPERATIONAL_BASE', 'STOP_POINT', 'PASSENGER_PICKUP']).optional(),
  addressStructured: structuredAddressSchema,
  point: geoPointSchema,
  geofence: z.array(geoPointSchema).min(4).optional(),
  geofenceRadiusMeters: z.coerce.number().int().positive().optional(),
});

const updateLocationSchema = z.object({
  clientCompanyId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(255).optional(),
  locationType: z.enum(['CLIENT_SITE', 'OPERATIONAL_BASE', 'STOP_POINT', 'PASSENGER_PICKUP']).optional(),
  addressStructured: structuredAddressSchema.optional(),
  point: geoPointSchema.optional(),
  geofenceRadiusMeters: z.coerce.number().int().positive().optional(),
});

const updateGeofenceSchema = z.object({
  geofence: z.array(geoPointSchema).min(4).optional(),
  geofenceRadiusMeters: z.coerce.number().int().positive().optional(),
});

const listLocationsFilterSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  locationType: z.enum(['CLIENT_SITE', 'OPERATIONAL_BASE', 'STOP_POINT', 'PASSENGER_PICKUP']).optional(),
  clientCompanyId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const nearbyQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().positive().default(1000),
});

const evaluatePointSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

@Controller('locations')
export class LocationController {
  constructor(private readonly service: LocationManagementService) {}

  private extractTenantId(tenantIdHeader?: string): string {
    if (
      !tenantIdHeader ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdHeader)
    ) {
      throw new BadRequestException('Valid x-tenant-id header is required');
    }
    return tenantIdHeader;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<LocationResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createLocationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.create(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof ClientCompanyNotBelongingError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof LocationDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get()
  async list(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query() query: unknown,
  ): Promise<{ items: LocationResponseDto[]; total: number }> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = listLocationsFilterSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.service.list(tenantId, parsed.data);
  }

  @Get('nearby')
  async findNearby(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query() query: unknown,
  ): Promise<LocationResponseDto[]> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = nearbyQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.service.findNearby(
      tenantId,
      { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
      parsed.data.radiusMeters,
    );
  }

  @Get(':id')
  async findById(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<LocationResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    try {
      return await this.service.findById(tenantId, id);
    } catch (err) {
      if (err instanceof LocationNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  @Patch(':id')
  async update(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LocationResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = updateLocationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.update(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof LocationNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ClientCompanyNotBelongingError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof LocationDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Put(':id/geofence')
  async updateGeofence(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LocationResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = updateGeofenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.updateGeofence(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof LocationNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof LocationDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post(':id/evaluate-point')
  async evaluatePoint(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GeofenceEvaluationResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = evaluatePointSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.evaluatePointContainment(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof LocationNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }
}
