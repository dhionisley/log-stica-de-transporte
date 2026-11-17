import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { AuthService } from '../application/auth.service';
import { MfaService } from '../application/mfa.service';
import { JwtAuthGuard, Public } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { JwtPayload } from '../domain/crypto/jwt.service';

const loginSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().trim().email(),
  password: z.string().min(8),
  deviceId: z.string().trim().optional(),
  deviceName: z.string().trim().optional(),
});

const mfaVerifySchema = z.object({
  mfaTicket: z.string().min(10),
  code: z.string().trim().min(6).max(20),
  deviceId: z.string().trim().optional(),
  deviceName: z.string().trim().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
  email: z.string().trim().email(),
});

const setPasswordSchema = z.object({
  password: z.string().min(8),
});

const mfaActivateSchema = z.object({
  code: z.string().trim().length(6),
});

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.authService.login({
      tenantId: parsed.data.tenantId,
      email: parsed.data.email,
      password: parsed.data.password,
      deviceId: parsed.data.deviceId,
      deviceName: parsed.data.deviceName,
      ipAddress: ip,
      userAgent,
    });
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    const parsed = mfaVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.authService.verifyMfaChallenge(
      parsed.data.mfaTicket,
      parsed.data.code,
      {
        deviceId: parsed.data.deviceId,
        deviceName: parsed.data.deviceName,
        ipAddress: ip,
        userAgent,
      },
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() body: unknown,
  ) {
    if (!tenantIdHeader) {
      throw new BadRequestException('x-tenant-id header is required');
    }

    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    try {
      const tokens = await this.authService.refreshTokens(
        tenantIdHeader,
        parsed.data.refreshToken,
        parsed.data.email,
      );
      return { tokens };
    } catch (err) {
      throw new UnauthorizedException((err as Error).message);
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { sessionId?: string },
  ) {
    const sessionId = body?.sessionId ?? user.session_id;
    await this.authService.logout(user.tenant_id, sessionId);
  }

  @Post('users/:userId/password')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentUser('sub') actorId?: string,
  ) {
    if (!tenantIdHeader) {
      throw new BadRequestException('x-tenant-id header is required');
    }

    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    await this.authService.setUserPassword(tenantIdHeader, userId, parsed.data.password, actorId);
    return { success: true };
  }

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  async setupMfa(@CurrentUser() user: JwtPayload) {
    const client = await this.pool.connect();
    try {
      return await this.mfaService.setupTotp(client, user.tenant_id, user.sub);
    } finally {
      client.release();
    }
  }

  @Post('mfa/activate')
  @HttpCode(HttpStatus.OK)
  async activateMfa(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    const parsed = mfaActivateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const client = await this.pool.connect();
    try {
      const success = await this.mfaService.activateTotp(client, user.tenant_id, user.sub, parsed.data.code);
      if (!success) {
        throw new BadRequestException('Invalid verification code for MFA activation');
      }
      return { active: true };
    } finally {
      client.release();
    }
  }
}
