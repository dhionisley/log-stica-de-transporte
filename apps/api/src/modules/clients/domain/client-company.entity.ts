import { randomUUID } from 'node:crypto';

export type ClientCompanyStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export interface BillingAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface CompanyContact {
  name: string;
  email: string;
  phone?: string;
  role?: string;
  isPrimary: boolean;
}

export interface ClientCompanyProps {
  id: string;
  tenantId: string;
  legalName: string;
  commercialName: string;
  taxId: string;
  status: ClientCompanyStatus;
  timezone: string;
  billingAddress: BillingAddress;
  billingContactData: Record<string, unknown>;
  contacts: CompanyContact[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClientCompanyProps {
  id?: string;
  tenantId: string;
  legalName: string;
  commercialName: string;
  taxId: string;
  timezone?: string;
  billingAddress?: BillingAddress;
  billingContactData?: Record<string, unknown>;
  contacts?: CompanyContact[];
}

export interface UpdateClientCompanyProps {
  legalName?: string;
  commercialName?: string;
  timezone?: string;
  billingAddress?: BillingAddress;
  billingContactData?: Record<string, unknown>;
  contacts?: CompanyContact[];
}

export class ClientCompanyDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientCompanyDomainError';
  }
}

export function normalizeTaxId(taxId: string): string {
  return taxId.replace(/\D/g, '');
}

export function validateCnpj(cnpj: string): boolean {
  const digits = normalizeTaxId(cnpj);
  if (digits.length !== 14) {
    return false;
  }
  // Elimina sequências repetidas como 11111111111111
  if (/^(\d)\1+$/.test(digits)) {
    return false;
  }

  const calcDigit = (slice: string, factors: number[]): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number.parseInt(slice[i], 10) * factors[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const factors1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(digits.slice(0, 12), factors1);
  if (d1 !== Number.parseInt(digits[12], 10)) {
    return false;
  }

  const factors2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d2 = calcDigit(digits.slice(0, 13), factors2);
  return d2 === Number.parseInt(digits[13], 10);
}

export class ClientCompany {
  private constructor(private props: ClientCompanyProps) {}

  static create(props: CreateClientCompanyProps): ClientCompany {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new ClientCompanyDomainError('tenantId is required');
    }

    const legalName = props.legalName?.trim();
    if (!legalName || legalName.length === 0) {
      throw new ClientCompanyDomainError('legalName is required');
    }

    const commercialName = props.commercialName?.trim();
    if (!commercialName || commercialName.length === 0) {
      throw new ClientCompanyDomainError('commercialName is required');
    }

    const normalizedTaxId = normalizeTaxId(props.taxId ?? '');
    if (!validateCnpj(normalizedTaxId)) {
      throw new ClientCompanyDomainError('Invalid CNPJ/taxId format or checksum');
    }

    const now = new Date();
    return new ClientCompany({
      id: props.id ?? randomUUID(),
      tenantId: props.tenantId,
      legalName,
      commercialName,
      taxId: normalizedTaxId,
      status: 'ACTIVE',
      timezone: props.timezone ?? 'America/Sao_Paulo',
      billingAddress: props.billingAddress ?? {
        street: '',
        number: '',
        neighborhood: '',
        city: '',
        state: '',
        postalCode: '',
      },
      billingContactData: props.billingContactData ?? {},
      contacts: props.contacts ?? [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ClientCompanyProps): ClientCompany {
    return new ClientCompany({ ...props });
  }

  get id(): string { return this.props.id; }
  get tenantId(): string { return this.props.tenantId; }
  get legalName(): string { return this.props.legalName; }
  get commercialName(): string { return this.props.commercialName; }
  get taxId(): string { return this.props.taxId; }
  get status(): ClientCompanyStatus { return this.props.status; }
  get timezone(): string { return this.props.timezone; }
  get billingAddress(): Readonly<BillingAddress> { return this.props.billingAddress; }
  get billingContactData(): Readonly<Record<string, unknown>> { return this.props.billingContactData; }
  get contacts(): ReadonlyArray<CompanyContact> { return this.props.contacts; }
  get version(): number { return this.props.version; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  update(props: UpdateClientCompanyProps): void {
    if (this.props.status === 'BLOCKED') {
      throw new ClientCompanyDomainError('Cannot update a blocked client company');
    }

    if (props.legalName !== undefined) {
      const trimmed = props.legalName.trim();
      if (trimmed.length === 0) {
        throw new ClientCompanyDomainError('legalName cannot be empty');
      }
      this.props.legalName = trimmed;
    }

    if (props.commercialName !== undefined) {
      const trimmed = props.commercialName.trim();
      if (trimmed.length === 0) {
        throw new ClientCompanyDomainError('commercialName cannot be empty');
      }
      this.props.commercialName = trimmed;
    }

    if (props.timezone !== undefined) {
      this.props.timezone = props.timezone.trim();
    }

    if (props.billingAddress !== undefined) {
      this.props.billingAddress = { ...props.billingAddress };
    }

    if (props.billingContactData !== undefined) {
      this.props.billingContactData = { ...props.billingContactData };
    }

    if (props.contacts !== undefined) {
      this.props.contacts = [...props.contacts];
    }

    this.props.updatedAt = new Date();
  }

  activate(): void {
    if (this.props.status === 'ACTIVE') {
      return;
    }
    this.props.status = 'ACTIVE';
    this.props.updatedAt = new Date();
  }

  inactivate(): void {
    if (this.props.status === 'INACTIVE') {
      return;
    }
    this.props.status = 'INACTIVE';
    this.props.updatedAt = new Date();
  }

  block(reason?: string): void {
    if (this.props.status === 'BLOCKED') {
      return;
    }
    if (!reason || reason.trim().length === 0) {
      throw new ClientCompanyDomainError('Reason is required when blocking a client company');
    }
    this.props.status = 'BLOCKED';
    this.props.updatedAt = new Date();
  }
}

