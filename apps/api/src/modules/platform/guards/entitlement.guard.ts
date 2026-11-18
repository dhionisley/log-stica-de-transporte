import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContextService } from '../../../common/observability/request-context.service';
import { EntitlementService } from '../application/entitlement.service';

export const REQUIRE_FEATURE_KEY = 'require_feature';
export const RequireFeature = (featureCode: string) => SetMetadata(REQUIRE_FEATURE_KEY, featureCode);

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementService: EntitlementService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId =
      this.requestContext.get()?.tenantId ??
      request.user?.tenant_id ??
      (request.headers['x-tenant-id'] as string | undefined);

    if (!tenantId) {
      throw new ForbiddenException('Tenant context is missing for entitlement verification');
    }

    const hasAccess = await this.entitlementService.hasFeature(tenantId, requiredFeature);
    if (!hasAccess) {
      throw new ForbiddenException({
        error: {
          code: 'FEATURE_NOT_IN_PLAN',
          message: `The feature "${requiredFeature}" is not active or included in the current subscription plan`,
          details: { requiredFeature },
          retryable: false,
        },
      });
    }

    return true;
  }
}

