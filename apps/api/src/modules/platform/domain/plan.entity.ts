import { randomUUID } from 'node:crypto';

export type PlanStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface PlanFeatureValue {
  enabled: boolean;
  max?: number;
  [key: string]: unknown;
}

export interface PlanProps {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: PlanStatus;
  features: Map<string, PlanFeatureValue>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlanProps {
  id?: string;
  code: string;
  name: string;
  description?: string;
  features?: Record<string, PlanFeatureValue>;
}

export class PlanDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanDomainError';
  }
}

export class Plan {
  private constructor(private props: PlanProps) {}

  static create(props: CreatePlanProps): Plan {
    const code = props.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      throw new PlanDomainError('Plan code must contain only uppercase alphanumeric characters, underscores and hyphens');
    }

    if (!props.name || props.name.trim().length === 0) {
      throw new PlanDomainError('Plan name is required');
    }

    const featureMap = new Map<string, PlanFeatureValue>();
    if (props.features) {
      for (const [k, v] of Object.entries(props.features)) {
        featureMap.set(k, v);
      }
    }

    const now = new Date();
    return new Plan({
      id: props.id ?? randomUUID(),
      code,
      name: props.name.trim(),
      description: props.description?.trim(),
      status: 'ACTIVE',
      features: featureMap,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: PlanProps): Plan {
    return new Plan(props);
  }

  get id(): string {
    return this.props.id;
  }

  get code(): string {
    return this.props.code;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get status(): PlanStatus {
    return this.props.status;
  }

  get features(): ReadonlyMap<string, PlanFeatureValue> {
    return this.props.features;
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

  isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }

  getFeature(code: string): PlanFeatureValue | undefined {
    return this.props.features.get(code);
  }

  setFeature(code: string, value: PlanFeatureValue): void {
    this.props.features.set(code, value);
    this.touch();
  }

  deactivate(): void {
    if (this.props.status === 'INACTIVE') return;
    this.props.status = 'INACTIVE';
    this.touch();
  }

  archive(): void {
    if (this.props.status === 'ARCHIVED') return;
    this.props.status = 'ARCHIVED';
    this.touch();
  }

  private touch(): void {
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }
}

