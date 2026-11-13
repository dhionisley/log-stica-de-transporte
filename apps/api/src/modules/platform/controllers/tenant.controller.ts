import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import {
  TenantManagementService,
  TenantNotFoundError,
  TenantResponseDto,
  TenantSlugConflictError,
} from '../application/tenant-management.service';
import { TenantDomainError } from '../domain/tenant.entity';

const provisionSchema = z.object({
  slug: z.string().trim().min(3).max(64).regex(/^[a-z0-9-]+$/),
  legalName: z.string().trim().min(2).max(255),
  commercialName: z.string().trim().max(255).optional(),
  defaultTimezone: z.string().trim().min(2).max(64).default('America/Sao_Paulo'),
});

const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const settingSchema = z.object({
  value: z.unknown(),
});

@Controller('platform/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantManagementService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async provision(@Body() body: unknown): Promise<TenantResponseDto> {
    const parseRes = provisionSchema.safeParse(body);
    if (!parseRes.success) {
      throw new BadRequestException(parseRes.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.tenantService.provisionTenant(parseRes.data);
    } catch (error) {
      if (error instanceof TenantSlugConflictError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof TenantDomainError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<TenantResponseDto> {
    try {
      return await this.tenantService.getTenant(id);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string): Promise<TenantResponseDto> {
    try {
      return await this.tenantService.activateTenant(id);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof TenantDomainError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<TenantResponseDto> {
    const parseRes = reasonSchema.safeParse(body);
    if (!parseRes.success) {
      throw new BadRequestException(parseRes.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.tenantService.suspendTenant(id, parseRes.data.reason);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof TenantDomainError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/terminate')
  @HttpCode(HttpStatus.OK)
  async terminate(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<TenantResponseDto> {
    const parseRes = reasonSchema.safeParse(body);
    if (!parseRes.success) {
      throw new BadRequestException(parseRes.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.tenantService.terminateTenant(id, parseRes.data.reason);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof TenantDomainError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(':id/settings')
  async getSettings(@Param('id') id: string): Promise<Record<string, unknown>> {
    return this.tenantService.getSettings(id);
  }

  @Put(':id/settings/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setSetting(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<void> {
    const parseRes = settingSchema.safeParse(body);
    if (!parseRes.success) {
      throw new BadRequestException('Invalid setting value');
    }

    try {
      await this.tenantService.setSetting(id, key, parseRes.data.value);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}

