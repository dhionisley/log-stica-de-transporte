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
  ClientCompanyManagementService,
  ClientCompanyNotFoundError,
  ClientCompanyTaxIdConflictError,
  type ClientCompanyResponseDto,
} from '../application/client-company-management.service';
import { ClientCompanyDomainError } from '../domain/client-company.entity';

const billingAddressSchema = z.object({
  street: z.string().trim().min(1),
  number: z.string().trim().min(1),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().length(2),
  postalCode: z.string().trim().min(8),
  country: z.string().trim().optional(),
});

const companyContactSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional(),
  role: z.string().trim().optional(),
  isPrimary: z.boolean().default(false),
});

const createClientCompanySchema = z.object({
  legalName: z.string().trim().min(2).max(255),
  commercialName: z.string().trim().min(2).max(255),
  taxId: z.string().trim().min(11).max(20),
  timezone: z.string().trim().optional(),
  billingAddress: billingAddressSchema.optional(),
  billingContactData: z.record(z.string(), z.any()).optional(),
  contacts: z.array(companyContactSchema).optional(),
});

const updateClientCompanySchema = z.object({
  legalName: z.string().trim().min(2).max(255).optional(),
  commercialName: z.string().trim().min(2).max(255).optional(),
  timezone: z.string().trim().optional(),
  billingAddress: billingAddressSchema.optional(),
  billingContactData: z.record(z.string(), z.any()).optional(),
  contacts: z.array(companyContactSchema).optional(),
});

const changeStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']),
  reason: z.string().trim().optional(),
});

const listFilterSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

@Controller('clients')
export class ClientCompanyController {
  constructor(
    private readonly service: ClientCompanyManagementService,
  ) {}

  private extractTenantId(tenantIdHeader?: string): string {
    if (!tenantIdHeader || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdHeader)) {
      throw new BadRequestException('Valid x-tenant-id header is required');
    }
    return tenantIdHeader;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<ClientCompanyResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createClientCompanySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.create(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof ClientCompanyTaxIdConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof ClientCompanyDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get()
  async list(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query() query: unknown,
  ): Promise<{ items: ClientCompanyResponseDto[]; total: number }> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = listFilterSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.service.list(tenantId, parsed.data);
  }

  @Get(':id')
  async findById(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<ClientCompanyResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    try {
      return await this.service.findById(tenantId, id);
    } catch (err) {
      if (err instanceof ClientCompanyNotFoundError) {
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
  ): Promise<ClientCompanyResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = updateClientCompanySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.update(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof ClientCompanyNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ClientCompanyDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post(':id/status')
  async changeStatus(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ClientCompanyResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = changeStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.changeStatus(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof ClientCompanyNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ClientCompanyDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}

