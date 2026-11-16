import { randomUUID } from 'node:crypto';

export interface UserProfileAssignmentProps {
  id: string;
  tenantId: string;
  userId: string;
  profileId: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  assignedBy?: string;
  createdAt: Date;
}

export interface CreateAssignmentProps {
  id?: string;
  tenantId: string;
  userId: string;
  profileId: string;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  assignedBy?: string;
}

export class UserProfileAssignment {
  private constructor(private props: UserProfileAssignmentProps) {}

  static create(props: CreateAssignmentProps): UserProfileAssignment {
    if (!props.tenantId || !props.userId || !props.profileId) {
      throw new Error('TenantId, UserId and ProfileId are required for assignment');
    }

    const now = new Date();
    return new UserProfileAssignment({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      userId: props.userId,
      profileId: props.profileId,
      effectiveFrom: props.effectiveFrom ?? now,
      effectiveTo: props.effectiveTo,
      assignedBy: props.assignedBy,
      createdAt: now,
    });
  }

  static reconstitute(props: UserProfileAssignmentProps): UserProfileAssignment {
    return new UserProfileAssignment(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get profileId(): string {
    return this.props.profileId;
  }

  get effectiveFrom(): Date {
    return this.props.effectiveFrom;
  }

  get effectiveTo(): Date | undefined {
    return this.props.effectiveTo;
  }

  get assignedBy(): string | undefined {
    return this.props.assignedBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  isActive(at: Date = new Date()): boolean {
    if (this.props.effectiveFrom > at) {
      return false;
    }
    if (this.props.effectiveTo && this.props.effectiveTo <= at) {
      return false;
    }
    return true;
  }

  revoke(at: Date = new Date()): void {
    this.props.effectiveTo = at;
  }

  toObject(): Readonly<UserProfileAssignmentProps> {
    return Object.freeze({ ...this.props });
  }
}

