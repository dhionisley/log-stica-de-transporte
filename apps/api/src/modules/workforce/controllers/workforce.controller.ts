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
  WorkforceManagementService,
  PersonNotFoundError,
  PersonDocumentConflictError,
  EmployeeNotFoundError,
  EmployeeAlreadyExistsError,
  EmploymentNotFoundError,
  ProvisionalAuthNotFoundError,
  DriverNotFoundError,
  DriverPersonConflictError,
  DriverLicenseConflictError,
  type PersonResponseDto,
  type EmployeeResponseDto,
  type CompanyEmploymentResponseDto,
  type ProvisionalAuthResponseDto,
  type DriverResponseDto,
  type DriverDocumentResponseDto,
} from '../application/workforce-management.service';
import { PersonDomainError } from '../domain/person.entity';
import { EmployeeDomainError } from '../domain/employee.entity';
import { CompanyEmploymentDomainError } from '../domain/company-employment.entity';
import { ProvisionalAuthorizationDomainError } from '../domain/provisional-transport-authorization.entity';
import { DriverDomainError } from '../domain/driver.types';
import type { DriverEligibilityRecord } from '../domain/workforce.repository';

const createPersonSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  preferredName: z.string().trim().optional(),
  documentRef: z.string().trim().min(11).max(14),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
});

const updatePersonSchema = z.object({
  fullName: z.string().trim().min(2).max(255).optional(),
  preferredName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
});

const createEmployeeSchema = z.object({
  personId: z.string().uuid(),
  platformAccountStatus: z.enum(['LINKED', 'UNLINKED']).optional(),
});

const changeEmployeeStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  reason: z.string().trim().optional(),
});

const createEmploymentSchema = z.object({
  employeeId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  externalEmployeeCode: z.string().trim().optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
});

const createProvisionalAuthSchema = z.object({
  employeeId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  completedReason: z.string().trim().optional(),
});

const revokeProvisionalAuthSchema = z.object({
  reason: z.string().trim().min(1),
});

const createDriverSchema = z.object({
  personId: z.string().uuid(),
  licenseNumber: z.string().trim().min(5).max(30),
  licenseCategory: z.enum(['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']),
  licenseExpiresAt: z.string().datetime(),
});

const updateDriverSchema = z.object({
  licenseCategory: z.enum(['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']).optional(),
  licenseExpiresAt: z.string().datetime().optional(),
});

const suspendDriverSchema = z.object({
  reason: z.string().trim().min(1),
});

const attachDriverDocSchema = z.object({
  documentType: z.string().trim().min(2).max(50),
  documentNumber: z.string().trim().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const listDriversFilterSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

@Controller('workforce')
export class WorkforceController {
  constructor(private readonly service: WorkforceManagementService) {}

  private extractTenantId(tenantIdHeader?: string): string {
    if (!tenantIdHeader || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdHeader)) {
      throw new BadRequestException('Valid x-tenant-id header is required');
    }
    return tenantIdHeader;
  }

  // --- PERSONS ---

  @Post('people')
  @HttpCode(HttpStatus.CREATED)
  async createPerson(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<PersonResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createPersonSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.createPerson(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof PersonDocumentConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof PersonDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('people')
  async listPeople(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<{ items: PersonResponseDto[]; total: number }> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    return await this.service.listPeople(tenantId, { status, search });
  }

  @Get('people/:id')
  async findPersonById(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<PersonResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    try {
      return await this.service.findPersonById(tenantId, id);
    } catch (err) {
      if (err instanceof PersonNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  @Patch('people/:id')
  async updatePerson(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PersonResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = updatePersonSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.updatePerson(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof PersonNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof PersonDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  // --- EMPLOYEES ---

  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  async createEmployee(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<EmployeeResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.createEmployee(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof PersonNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof EmployeeAlreadyExistsError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof EmployeeDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('employees/:id')
  async findEmployeeById(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<EmployeeResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    try {
      return await this.service.findEmployeeById(tenantId, id);
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  @Post('employees/:id/status')
  async changeEmployeeStatus(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<EmployeeResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = changeEmployeeStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.changeEmployeeStatus(
        tenantId,
        id,
        parsed.data.status,
        parsed.data.reason,
      );
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof EmployeeDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  // --- EMPLOYMENTS ---

  @Post('employments')
  @HttpCode(HttpStatus.CREATED)
  async createEmployment(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<CompanyEmploymentResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createEmploymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.createEmployment(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof CompanyEmploymentDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post('employments/:id/terminate')
  async terminateEmployment(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body('terminatedAt') terminatedAt?: string,
  ): Promise<CompanyEmploymentResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    try {
      return await this.service.terminateEmployment(tenantId, id, terminatedAt);
    } catch (err) {
      if (err instanceof EmploymentNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  @Get('employments')
  async listEmployments(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query('clientCompanyId') clientCompanyId: string,
    @Query('status') status?: string,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<CompanyEmploymentResponseDto[]> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    if (!clientCompanyId) {
      throw new BadRequestException('clientCompanyId query param is required');
    }
    return await this.service.listEmploymentsByCompany(tenantId, clientCompanyId, {
      status,
      activeOnly: activeOnly === 'true',
    });
  }

  // --- PROVISIONAL AUTHORIZATIONS ---

  @Post('provisional-authorizations')
  @HttpCode(HttpStatus.CREATED)
  async createProvisionalAuth(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<ProvisionalAuthResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createProvisionalAuthSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.createProvisionalAuthorization(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ProvisionalAuthorizationDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post('provisional-authorizations/:id/revoke')
  async revokeProvisionalAuth(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ProvisionalAuthResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = revokeProvisionalAuthSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.revokeProvisionalAuthorization(tenantId, id, parsed.data.reason);
    } catch (err) {
      if (err instanceof ProvisionalAuthNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ProvisionalAuthorizationDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('provisional-authorizations')
  async listProvisionalAuthorizations(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query('clientCompanyId') clientCompanyId?: string,
  ): Promise<ProvisionalAuthResponseDto[]> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    return await this.service.listProvisionalAuthorizations(tenantId, clientCompanyId);
  }

  // --- DRIVERS ---

  @Post('drivers')
  @HttpCode(HttpStatus.CREATED)
  async createDriver(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<DriverResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createDriverSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.createDriver(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof PersonNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof DriverPersonConflictError || err instanceof DriverLicenseConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof DriverDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('drivers')
  async listDrivers(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query() query: unknown,
  ): Promise<{ items: DriverResponseDto[]; total: number }> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = listDriversFilterSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.service.listDrivers(tenantId, parsed.data);
  }

  @Get('drivers/:id')
  async findDriverById(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<DriverResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    try {
      return await this.service.findDriverById(tenantId, id);
    } catch (err) {
      if (err instanceof DriverNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  @Patch('drivers/:id')
  async updateDriver(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DriverResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = updateDriverSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.updateDriver(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof DriverNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof DriverDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post('drivers/:id/suspend')
  async suspendDriver(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DriverResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = suspendDriverSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.suspendDriver(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof DriverNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof DriverDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post('drivers/:id/reactivate')
  async reactivateDriver(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<DriverResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    try {
      return await this.service.reactivateDriver(tenantId, id);
    } catch (err) {
      if (err instanceof DriverNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof DriverDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post('drivers/:id/documents')
  @HttpCode(HttpStatus.CREATED)
  async attachDriverDocument(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DriverDocumentResponseDto> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = attachDriverDocSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.service.attachDriverDocument(tenantId, id, parsed.data);
    } catch (err) {
      if (err instanceof DriverNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof DriverDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('drivers/:id/eligibility-history')
  async listDriverEligibilities(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<DriverEligibilityRecord[]> {
    const tenantId = this.extractTenantId(tenantIdHeader);
    return await this.service.listDriverEligibilities(tenantId, id);
  }
}
