import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import {
  SubscriptionManagementService,
  type SubscriptionResponseDto,
} from '../application/subscription-management.service';
import { EntitlementService, type TenantEntitlements } from '../application/entitlement.service';

const provisionSubscriptionSchema = z.object({
  planCode: z.string().trim().min(2),
  startsAt: z.string().datetime().optional(),
  customLimits: z.record(z.string(), z.any()).optional(),
});

const changePlanSchema = z.object({
  planCode: z.string().trim().min(2),
});

const customLimitsSchema = z.object({
  customLimits: z.record(z.string(), z.any()),
});

@Controller('platform/tenants/:tenantId')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionManagementService,
    private readonly entitlementService: EntitlementService,
  ) {}

  @Get('subscription')
  async getSubscription(
    @Param('tenantId') tenantId: string,
  ): Promise<SubscriptionResponseDto> {
    return await this.subscriptionService.getSubscription(tenantId);
  }

  @Get('entitlements')
  async getEntitlements(
    @Param('tenantId') tenantId: string,
  ): Promise<TenantEntitlements> {
    return await this.entitlementService.resolveEntitlements(tenantId);
  }

  @Post('subscription')
  @HttpCode(HttpStatus.CREATED)
  async provision(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ): Promise<SubscriptionResponseDto> {
    const parsed = provisionSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.subscriptionService.provisionSubscription(tenantId, parsed.data);
  }

  @Put('subscription/plan')
  @HttpCode(HttpStatus.OK)
  async changePlan(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ): Promise<SubscriptionResponseDto> {
    const parsed = changePlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.subscriptionService.changePlan(tenantId, parsed.data.planCode);
  }

  @Put('subscription/custom-limits')
  @HttpCode(HttpStatus.OK)
  async updateCustomLimits(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ): Promise<SubscriptionResponseDto> {
    const parsed = customLimitsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }

    return await this.subscriptionService.updateCustomLimits(tenantId, parsed.data.customLimits);
  }
}

