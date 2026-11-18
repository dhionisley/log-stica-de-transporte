import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Plan, PlanDomainError } from '../src/modules/platform/domain/plan.entity';
import { Subscription, SubscriptionDomainError } from '../src/modules/platform/domain/subscription.entity';
import { EntitlementService } from '../src/modules/platform/application/entitlement.service';
import { EntitlementGuard } from '../src/modules/platform/guards/entitlement.guard';
import { RequestContextService } from '../src/common/observability/request-context.service';

describe('Plans & Entitlements Domain (Unit)', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const planId = '11111111-1111-1111-1111-111111111111';

  describe('Plan Aggregate', () => {
    it('creates a plan with uppercase code and features map', () => {
      const plan = Plan.create({
        code: 'pro_fleet',
        name: 'Professional Fleet',
        description: 'Advanced transport plan',
        features: {
          max_vehicles: { enabled: true, max: 20 },
          realtime_tracking: { enabled: true },
        },
      });

      expect(plan.id).toBeDefined();
      expect(plan.code).toBe('PRO_FLEET');
      expect(plan.name).toBe('Professional Fleet');
      expect(plan.status).toBe('ACTIVE');
      expect(plan.isActive()).toBe(true);
      expect(plan.getFeature('max_vehicles')).toEqual({ enabled: true, max: 20 });
      expect(plan.getFeature('realtime_tracking')).toEqual({ enabled: true });
    });

    it('rejects plan code with invalid characters or empty name', () => {
      expect(() =>
        Plan.create({
          code: 'invalid code with spaces',
          name: 'Invalid Plan',
        }),
      ).toThrow(PlanDomainError);

      expect(() =>
        Plan.create({
          code: 'VALID_CODE',
          name: '   ',
        }),
      ).toThrow(PlanDomainError);
    });

    it('manages plan lifecycle state transitions', () => {
      const plan = Plan.create({
        code: 'STARTER',
        name: 'Starter Plan',
      });

      expect(plan.version).toBe(1);
      plan.deactivate();
      expect(plan.status).toBe('INACTIVE');
      expect(plan.isActive()).toBe(false);
      expect(plan.version).toBe(2);

      plan.archive();
      expect(plan.status).toBe('ARCHIVED');
      expect(plan.version).toBe(3);
    });
  });

  describe('Subscription Aggregate', () => {
    it('creates subscription and validates active status by date and state', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000);
      const future = new Date(now.getTime() + 100000);

      const sub = Subscription.create({
        tenantId,
        planId,
        startsAt: past,
        endsAt: future,
      });

      expect(sub.id).toBeDefined();
      expect(sub.tenantId).toBe(tenantId);
      expect(sub.planId).toBe(planId);
      expect(sub.status).toBe('ACTIVE');
      expect(sub.isActive(now)).toBe(true);

      // Assinatura com data final no passado deve reportar inativa
      const expired = Subscription.create({
        tenantId,
        planId,
        startsAt: new Date(now.getTime() - 20000),
        endsAt: new Date(now.getTime() - 10000),
      });
      expect(expired.isActive(now)).toBe(false);
    });

    it('supports plan change, custom limits and status transitions', () => {
      const sub = Subscription.create({
        tenantId,
        planId,
      });

      const newPlanId = '22222222-2222-2222-2222-222222222222';
      sub.changePlan(newPlanId);
      expect(sub.planId).toBe(newPlanId);
      expect(sub.version).toBe(2);

      sub.setCustomLimit('max_vehicles', { enabled: true, max: 100 });
      expect(sub.customLimits['max_vehicles']).toEqual({ enabled: true, max: 100 });
      expect(sub.version).toBe(3);

      sub.removeCustomLimit('max_vehicles');
      expect(sub.customLimits['max_vehicles']).toBeUndefined();
      expect(sub.version).toBe(4);

      sub.suspend();
      expect(sub.status).toBe('SUSPENDED');
      expect(sub.isActive()).toBe(false);

      sub.reactivate();
      expect(sub.status).toBe('ACTIVE');
      expect(sub.isActive()).toBe(true);

      sub.cancel();
      expect(sub.status).toBe('CANCELED');
      expect(sub.isActive()).toBe(false);
    });

    it('rejects invalid inputs on creation', () => {
      expect(() =>
        Subscription.create({
          tenantId: '',
          planId,
        }),
      ).toThrow(SubscriptionDomainError);

      expect(() =>
        Subscription.create({
          tenantId,
          planId: '',
        }),
      ).toThrow(SubscriptionDomainError);
    });
  });

  describe('EntitlementGuard (Unit)', () => {
    let guard: EntitlementGuard;
    let reflector: Reflector;
    let entitlementService: Partial<EntitlementService>;
    let requestContext: RequestContextService;

    beforeEach(() => {
      reflector = new Reflector();
      requestContext = new RequestContextService();
      entitlementService = {
        hasFeature: jest.fn().mockImplementation((_tId: string, feature: string) => {
          return Promise.resolve(feature === 'realtime_tracking');
        }),
      };
      guard = new EntitlementGuard(
        reflector,
        entitlementService as EntitlementService,
        requestContext,
      );
    });

    function createMockContext(featureMetadata?: string, tenantHeader?: string): ExecutionContext {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(featureMetadata);
      return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            headers: tenantHeader ? { 'x-tenant-id': tenantHeader } : {},
            user: { tenant_id: tenantId },
          }),
        }),
      } as unknown as ExecutionContext;
    }

    it('allows access when no feature requirement is set on the route', async () => {
      const ctx = createMockContext(undefined);
      const allowed = await guard.canActivate(ctx);
      expect(allowed).toBe(true);
    });

    it('allows access when tenant possesses the active feature in its plan', async () => {
      const ctx = createMockContext('realtime_tracking');
      const allowed = await guard.canActivate(ctx);
      expect(allowed).toBe(true);
    });

    it('rejects with FEATURE_NOT_IN_PLAN when feature is not included in tenant plan', async () => {
      const ctx = createMockContext('optimization_engine');
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });
});
