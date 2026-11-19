import { randomUUID } from 'node:crypto';

export type PersonStatus = 'ACTIVE' | 'INACTIVE';

export interface PersonProps {
  id: string;
  tenantId: string;
  fullName: string;
  preferredName?: string;
  documentRef: string;
  phone?: string;
  email?: string;
  status: PersonStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePersonProps {
  id?: string;
  tenantId: string;
  fullName: string;
  preferredName?: string;
  documentRef: string;
  phone?: string;
  email?: string;
}

export interface UpdatePersonProps {
  fullName?: string;
  preferredName?: string;
  phone?: string;
  email?: string;
}

export class PersonDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonDomainError';
  }
}

export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function validateCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf);
  if (digits.length !== 11) {
    return false;
  }
  if (/^(\d)\1+$/.test(digits)) {
    return false;
  }

  const calcDigit = (slice: string, factorStart: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number.parseInt(slice[i], 10) * (factorStart - i);
    }
    const rem = (sum * 10) % 11;
    return rem === 10 ? 0 : rem;
  };

  const d1 = calcDigit(digits.slice(0, 9), 10);
  if (d1 !== Number.parseInt(digits[9], 10)) {
    return false;
  }

  const d2 = calcDigit(digits.slice(0, 10), 11);
  return d2 === Number.parseInt(digits[10], 10);
}

export class Person {
  private constructor(private props: PersonProps) {}

  static create(props: CreatePersonProps): Person {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new PersonDomainError('tenantId is required');
    }

    const fullName = props.fullName?.trim();
    if (!fullName || fullName.length === 0) {
      throw new PersonDomainError('fullName is required');
    }

    const normalizedCpf = normalizeCpf(props.documentRef ?? '');
    if (!validateCpf(normalizedCpf)) {
      throw new PersonDomainError('Invalid CPF format or checksum');
    }

    const now = new Date();
    return new Person({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      fullName,
      preferredName: props.preferredName?.trim() || undefined,
      documentRef: normalizedCpf,
      phone: props.phone?.trim() || undefined,
      email: props.email?.trim().toLowerCase() || undefined,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: PersonProps): Person {
    return new Person({ ...props });
  }

  get id(): string { return this.props.id; }
  get tenantId(): string { return this.props.tenantId; }
  get fullName(): string { return this.props.fullName; }
  get preferredName(): string | undefined { return this.props.preferredName; }
  get documentRef(): string { return this.props.documentRef; }
  get phone(): string | undefined { return this.props.phone; }
  get email(): string | undefined { return this.props.email; }
  get status(): PersonStatus { return this.props.status; }
  get version(): number { return this.props.version; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  update(props: UpdatePersonProps): void {
    if (this.props.status === 'INACTIVE') {
      throw new PersonDomainError('Cannot update an inactive person');
    }

    if (props.fullName !== undefined) {
      const trimmed = props.fullName.trim();
      if (trimmed.length === 0) {
        throw new PersonDomainError('fullName cannot be empty');
      }
      this.props.fullName = trimmed;
    }

    if (props.preferredName !== undefined) {
      this.props.preferredName = props.preferredName.trim() || undefined;
    }

    if (props.phone !== undefined) {
      this.props.phone = props.phone.trim() || undefined;
    }

    if (props.email !== undefined) {
      this.props.email = props.email.trim().toLowerCase() || undefined;
    }

    this.props.updatedAt = new Date();
  }

  activate(): void {
    if (this.props.status === 'ACTIVE') return;
    this.props.status = 'ACTIVE';
    this.props.updatedAt = new Date();
  }

  inactivate(): void {
    if (this.props.status === 'INACTIVE') return;
    this.props.status = 'INACTIVE';
    this.props.updatedAt = new Date();
  }
}
