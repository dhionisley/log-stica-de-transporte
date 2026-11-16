import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  IamManagementService,
  UserEmailConflictError,
  ProfileNameConflictError,
  UserNotFoundError,
  ProfileNotFoundError,
  InvalidPermissionCodeError,
} from '../application/iam-management.service';
import { AuthorizationService } from '../application/authorization.service';
import { UserDomainError } from '../domain/user.entity';
import { PermissionProfileDomainError } from '../domain/permission-profile.entity';

const createUserSchema = z.object({
  email: z.string().trim().email(),
  phoneNormalized: z.string().trim().optional(),
  mfaRequired: z.boolean().optional(),
});

const createProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  profileType: z.enum(['ADMIN', 'SUPERVISOR', 'OPERATOR', 'CUSTOM']).optional(),
  permissions: z.array(z.string().trim()).optional(),
});

const assignProfileSchema = z.object({
  userId: z.string().uuid(),
  profileId: z.string().uuid(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

@Controller('iam')
export class IamController {
  constructor(
    private readonly iamService: IamManagementService,
    private readonly authService: AuthorizationService,
  ) {}

  @Get('permissions')
  async listPermissions() {
    return await this.iamService.listPermissions();
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ) {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.iamService.createUser(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof UserEmailConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof UserDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('users')
  async listUsers(@Headers('x-tenant-id') tenantIdHeader: string | undefined) {
    const tenantId = this.extractTenantId(tenantIdHeader);
    return await this.iamService.listUsers(tenantId);
  }

  @Post('profiles')
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ) {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = createProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      return await this.iamService.createProfile(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof ProfileNameConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof InvalidPermissionCodeError || err instanceof PermissionProfileDomainError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('profiles')
  async listProfiles(@Headers('x-tenant-id') tenantIdHeader: string | undefined) {
    const tenantId = this.extractTenantId(tenantIdHeader);
    return await this.iamService.listProfiles(tenantId);
  }

  @Post('assignments')
  @HttpCode(HttpStatus.NO_CONTENT)
  async assignProfile(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ) {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const parsed = assignProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      await this.iamService.assignProfileToUser(tenantId, parsed.data);
    } catch (err) {
      if (err instanceof UserNotFoundError || err instanceof ProfileNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  @Delete('assignments/:userId/:profileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeProfile(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('userId') userId: string,
    @Param('profileId') profileId: string,
  ) {
    const tenantId = this.extractTenantId(tenantIdHeader);
    await this.iamService.revokeProfileFromUser(tenantId, userId, profileId);
  }

  @Get('authorization/check')
  async checkPermission(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Query('userId') userId: string,
    @Query('permissionCode') permissionCode: string,
  ) {
    const tenantId = this.extractTenantId(tenantIdHeader);
    if (!userId || !permissionCode) {
      throw new BadRequestException('userId and permissionCode are required');
    }

    const hasPermission = await this.authService.hasPermission(
      tenantId,
      userId,
      permissionCode,
    );
    return { tenantId, userId, permissionCode, authorized: hasPermission };
  }

  @Get('users/:userId/permissions')
  async getUserPermissions(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('userId') userId: string,
  ) {
    const tenantId = this.extractTenantId(tenantIdHeader);
    const permissions = await this.authService.getUserPermissions(tenantId, userId);
    return { tenantId, userId, permissions };
  }

  private extractTenantId(tenantIdHeader?: string): string {
    if (!tenantIdHeader || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdHeader)) {
      throw new BadRequestException('Valid X-Tenant-Id UUID header is required');
    }
    return tenantIdHeader;
  }
}

