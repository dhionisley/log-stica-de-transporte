import { randomUUID } from 'node:crypto';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface UserProps {
  id: string;
  tenantId: string;
  email: string;
  emailNormalized: string;
  phoneNormalized?: string;
  status: UserStatus;
  mfaRequired: boolean;
  lastLoginAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserProps {
  id?: string;
  tenantId: string;
  email: string;
  phoneNormalized?: string;
  mfaRequired?: boolean;
}

export class UserDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserDomainError';
  }
}

export class User {
  private constructor(private props: UserProps) {}

  static create(props: CreateUserProps): User {
    const rawEmail = props.email ? props.email.trim() : '';
    if (!rawEmail || !rawEmail.includes('@')) {
      throw new UserDomainError('Valid email is required');
    }

    if (!props.tenantId) {
      throw new UserDomainError('Tenant ID is required');
    }

    const emailNormalized = rawEmail.toLowerCase();
    const now = new Date();

    return new User({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      email: rawEmail,
      emailNormalized,
      phoneNormalized: props.phoneNormalized?.trim() || undefined,
      status: 'ACTIVE',
      mfaRequired: props.mfaRequired ?? false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get email(): string {
    return this.props.email;
  }

  get emailNormalized(): string {
    return this.props.emailNormalized;
  }

  get phoneNormalized(): string | undefined {
    return this.props.phoneNormalized;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get mfaRequired(): boolean {
    return this.props.mfaRequired;
  }

  get lastLoginAt(): Date | undefined {
    return this.props.lastLoginAt;
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

  deactivate(): void {
    if (this.props.status === 'INACTIVE') {
      return;
    }
    this.props.status = 'INACTIVE';
    this.touch();
  }

  activate(): void {
    if (this.props.status === 'ACTIVE') {
      return;
    }
    this.props.status = 'ACTIVE';
    this.touch();
  }

  suspend(): void {
    if (this.props.status === 'SUSPENDED') {
      return;
    }
    this.props.status = 'SUSPENDED';
    this.touch();
  }

  setMfaRequired(required: boolean): void {
    if (this.props.mfaRequired === required) {
      return;
    }
    this.props.mfaRequired = required;
    this.touch();
  }

  recordLogin(at: Date = new Date()): void {
    this.props.lastLoginAt = at;
    this.touch();
  }

  private touch(): void {
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }

  toObject(): Readonly<UserProps> {
    return Object.freeze({ ...this.props });
  }
}

