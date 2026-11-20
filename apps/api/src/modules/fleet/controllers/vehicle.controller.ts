import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  VehicleManagementService,
  VehicleNotFoundError,
  VehiclePlateConflictError,
  VehicleFleetCodeConflictError,
  type VehicleResponseDto,
  type VehicleDocumentResponseDto,
} from '../application/vehicle-management.service';
import { VehicleDomainError } from '../domain/vehicle.types';
import type { EligibilityEvaluationResult } from '../domain/eligibility.service';

const createVehicleSchema = z.object({
  fleetCode: z.string().trim().min(1).max(50),
  plate: z.string().trim().min(5).max(10),
  category: z.enum(['CAR', 'VAN', 'MINIBUS', 'BUS']).optional(),
  capacity: z.coerce.number().int().positive(),
  accessibilityFeatures: z.array(z.string().trim()).optional(),
  odometerKm: z.coerce.number().int().nonnegative().optional(),
});

const updateVehicleSchema = z.object({
  fleetCode: z.string().trim().min(1).max(50).optional(),
  category: z.enum(['CAR', 'VAN', 'MINIBUS', 'BUS']).optional(),
  capacity: z.coerce.number().int().positive().optional(),
  accessibilityFeatures: z.array(z.string().trim()).optional(),
  odometerKm: z.coerce.number().int().nonnegative().optional(),
});

const changeOperationalStatusSchema = z.object({
  operationalStatus: z.enum(['AVAILABLE', 'IN_MAINTENANCE', 'OUT_OF_SERVICE']),
  reason: z.string().trim().optional(),
});

const attachDocumentSchema = z.object({
  documentType: z.string().trim().min(2).max(50),
  documentNumber: z.string().trim().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const listVehiclesFilterSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  operationalStatus: z.enum(['AVAILABLE', 'IN_MAINTENANCE', 'OUT_OF_SERVICE']).optional(),
  category: z.enum(['CAR', 'VAN', 'MINIBUS', 'BUS']).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const eligibilityQuerySchema = z.object({
  driverId: z.string().uuid().optional(),
  atDate: z.string().datetime().optional(),
});

@Controller('fleet/vehicles')
export class VehicleController {
  constructor(private readonly service: VehicleManagementService) {}

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
  ): Promise<VehicleResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createVehicleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.create(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof VehiclePlateConflictError || err instanceof VehicleFleetCodeConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof VehicleDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get()
  async list(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query() query: unknown,
  ): Promise<{ items: VehicleResponseDto[]; total: number }> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = listVehiclesFilterSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.service.list(tenantId, parsed.data);
  }

  @Get(':id')
  async findById(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<VehicleResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    try {
      return await this.service.findById(tenantId, id);
    } catch (err) {
      if (err instanceof VehicleNotFoundError) {
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
  ): Promise<VehicleResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = updateVehicleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.update(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof VehicleNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof VehicleFleetCodeConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof VehicleDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Patch(':id/operational-status')
  async changeOperationalStatus(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<VehicleResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = changeOperationalStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.changeOperationalStatus(
        tenantId,
        id,
        parsed.data.operationalStatus,
        parsed.data.reason,
      );
    } catch (err) {
      if (err instanceof VehicleNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof VehicleDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  async attachDocument(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<VehicleDocumentResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = attachDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.attachDocument(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof VehicleNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof VehicleDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get(':id/eligibility')
  async evaluateEligibility(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<EligibilityEvaluationResult> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = eligibilityQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const atDate = parsed.data.atDate ? new Date(parsed.data.atDate) : new Date();

    try {
      return await this.service.evaluateEligibility(tenantId, id, parsed.data.driverId, atDate);
    } catch (err) {
      if (err instanceof VehicleNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }
}
