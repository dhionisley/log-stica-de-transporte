import { randomUUID } from 'node:crypto';
import type { PlanFeatureValue } from './plan.entity';

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';

export interface SubscriptionProps {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  startsAt: Date;
  endsAt?: Date;
  customLimits: Record<string, PlanFeatureValue>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionProps {
  id?: string;
  tenantId: string;
  planId: string;
  startsAt?: Date;
  endsAt?: Date;
  customLimits?: Record<string, PlanFeatureValue>;
}

export class SubscriptionDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionDomainError';
  }
}

export class Subscription {
  private constructor(private props: SubscriptionProps) {}

  static create(props: CreateSubscriptionProps): Subscription {
    if (!props.tenantId) {
      throw new SubscriptionDomainError('Tenant ID is required');
    }
    if (!props.planId) {
      throw new SubscriptionDomainError('Plan ID is required');
    }

    const now = new Date();
    return new Subscription({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      planId: props.planId,
      status: 'ACTIVE',
      startsAt: props.startsAt ?? now,
      endsAt: props.endsAt,
      customLimits: props.customLimits ? { ...props.customLimits } : {},
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: SubscriptionProps): Subscription {
    return new Subscription(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get planId(): string {
    return this.props.planId;
  }

  get status(): SubscriptionStatus {
    return this.props.status;
  }

  get startsAt(): Date {
    return this.props.startsAt;
  }

  get endsAt(): Date | undefined {
    return this.props.endsAt;
  }

  get customLimits(): Readonly<Record<string, PlanFeatureValue>> {
    return Object.freeze({ ...this.props.customLimits });
  }

  get version(): number {
    return this.props.version;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isActive(now = new Date()): boolean {
    if (this.props.status !== 'ACTIVE') {
      return false;
    }
    if (this.props.endsAt && now.getTime() > this.props.endsAt.getTime()) {
      return false;
    }
    return now.getTime() >= this.props.startsAt.getTime();
  }

  changePlan(newPlanId: string): void {
    if (!newPlanId) {
      throw new SubscriptionDomainError('New plan ID is required');
    }
    if (this.props.planId === newPlanId) {
      return;
    }
    this.props.planId = newPlanId;
    this.touch();
  }

  setCustomLimit(featureCode: string, value: PlanFeatureValue): void {
    this.props.customLimits[featureCode] = value;
    this.touch();
  }

  removeCustomLimit(featureCode: string): void {
    if (featureCode in this.props.customLimits) {
      delete this.props.customLimits[featureCode];
      this.touch();
    }
  }

  suspend(): void {
    if (this.props.status === 'SUSPENDED') return;
    this.props.status = 'SUSPENDED';
    this.touch();
  }

  cancel(endsAt = new Date()): void {
    if (this.props.status === 'CANCELED') return;
    this.props.status = 'CANCELED';
    this.props.endsAt = endsAt;
    this.touch();
  }

  reactivate(): void {
    if (this.props.status === 'ACTIVE') return;
    this.props.status = 'ACTIVE';
    this.props.endsAt = undefined;
    this.touch();
  }

  private touch(): void {
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }
}

