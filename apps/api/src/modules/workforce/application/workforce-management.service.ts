import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresOutboxRepository } from '../../outbox/infrastructure/postgres-outbox.repository';
import {
  Person,
  type PersonStatus,
  normalizeCpf,
} from '../domain/person.entity';
import {
  Employee,
  type EmployeeStatus,
  type PlatformAccountStatus,
} from '../domain/employee.entity';
import {
  CompanyEmployment,
  type EmploymentStatus,
} from '../domain/company-employment.entity';
import {
  ProvisionalTransportAuthorization,
  type ProvisionalAuthStatus,
} from '../domain/provisional-transport-authorization.entity';
import {
  Driver,
} from '../domain/driver.entity';
import {
  DriverDocument,
} from '../domain/driver-document.entity';
import {
  type DriverDocumentStatus,
  type DriverLicenseCategory,
  type DriverStatus,
} from '../domain/driver.types';
import {
  WORKFORCE_REPOSITORY_TOKEN,
  type DriverEligibilityRecord,
  type IWorkforceRepository,
  type ListDriversFilter,
  type ListEmployeesFilter,
  type ListEmploymentsFilter,
  type ListPeopleFilter,
} from '../domain/workforce.repository';
import { toIntegrationPayload } from '../domain/workforce.events';

export interface CreatePersonDto {
  fullName: string;
  preferredName?: string;
  documentRef: string;
  phone?: string;
  email?: string;
}

export interface UpdatePersonDto {
  fullName?: string;
  preferredName?: string;
  phone?: string;
  email?: string;
}

export interface PersonResponseDto {
  id: string;
  tenantId: string;
  fullName: string;
  preferredName?: string;
  documentRef: string;
  phone?: string;
  email?: string;
  status: PersonStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeDto {
  personId: string;
  platformAccountStatus?: PlatformAccountStatus;
}

export interface EmployeeResponseDto {
  id: string;
  tenantId: string;
  personId: string;
  platformAccountStatus: PlatformAccountStatus;
  status: EmployeeStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyEmploymentDto {
  employeeId: string;
  clientCompanyId: string;
  externalEmployeeCode?: string;
  validFrom?: string;
  validTo?: string;
}

export interface CompanyEmploymentResponseDto {
  id: string;
  tenantId: string;
  employeeId: string;
  clientCompanyId: string;
  externalEmployeeCode?: string;
  validFrom: string;
  validTo?: string;
  status: EmploymentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProvisionalAuthDto {
  employeeId: string;
  clientCompanyId: string;
  validFrom: string;
  validTo: string;
  completedReason?: string;
}

export interface ProvisionalAuthResponseDto {
  id: string;
  tenantId: string;
  employeeId: string;
  clientCompanyId: string;
  validFrom: string;
  validTo: string;
  status: ProvisionalAuthStatus;
  approvedBy?: string;
  approvedAt: string;
  completedReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class PersonNotFoundError extends Error {
  constructor(id: string) {
    super(`Person not found: ${id}`);
    this.name = 'PersonNotFoundError';
  }
}

export class PersonDocumentConflictError extends Error {
  constructor(documentRef: string) {
    super(`Person with document "${documentRef}" already exists in this tenant`);
    this.name = 'PersonDocumentConflictError';
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(id: string) {
    super(`Employee not found: ${id}`);
    this.name = 'EmployeeNotFoundError';
  }
}

export class EmployeeAlreadyExistsError extends Error {
  constructor(personId: string) {
    super(`Employee already exists for person: ${personId}`);
    this.name = 'EmployeeAlreadyExistsError';
  }
}

export class EmploymentNotFoundError extends Error {
  constructor(id: string) {
    super(`Company employment not found: ${id}`);
    this.name = 'EmploymentNotFoundError';
  }
}

export class ProvisionalAuthNotFoundError extends Error {
  constructor(id: string) {
    super(`Provisional authorization not found: ${id}`);
    this.name = 'ProvisionalAuthNotFoundError';
  }
}

export interface CreateDriverDto {
  personId: string;
  licenseNumber: string;
  licenseCategory: DriverLicenseCategory;
  licenseExpiresAt: Date | string;
}

export interface UpdateDriverDto {
  licenseCategory?: DriverLicenseCategory;
  licenseExpiresAt?: Date | string;
}

export interface SuspendDriverDto {
  reason: string;
}

export interface AttachDriverDocumentDto {
  documentType: string;
  documentNumber: string;
  expiresAt?: Date | string;
  metadata?: Record<string, unknown>;
}

export interface DriverResponseDto {
  id: string;
  tenantId: string;
  personId: string;
  licenseNumber: string;
  licenseCategory: DriverLicenseCategory;
  licenseExpiresAt: string;
  status: DriverStatus;
  suspensionReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  documents?: DriverDocumentResponseDto[];
}

export interface DriverDocumentResponseDto {
  id: string;
  tenantId: string;
  driverId: string;
  documentType: string;
  documentNumber: string;
  expiresAt?: string;
  status: DriverDocumentStatus;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class DriverNotFoundError extends Error {
  constructor(id: string) {
    super(`Driver not found: ${id}`);
    this.name = 'DriverNotFoundError';
  }
}

export class DriverPersonConflictError extends Error {
  constructor(personId: string) {
    super(`Driver qualification already exists for person: ${personId}`);
    this.name = 'DriverPersonConflictError';
  }
}

export class DriverLicenseConflictError extends Error {
  constructor(licenseNumber: string) {
    super(`Driver with license number "${licenseNumber}" already exists in this tenant`);
    this.name = 'DriverLicenseConflictError';
  }
}

function toUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
}

@Injectable()
export class WorkforceManagementService {
  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
    @Inject(WORKFORCE_REPOSITORY_TOKEN)
    private readonly repository: IWorkforceRepository,
    private readonly outboxRepository: PostgresOutboxRepository,
  ) {}

  private async withTenantTransaction<T>(
    tenantId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- PERSON ---

  async createPerson(
    tenantId: string,
    dto: CreatePersonDto,
    actorId = 'system',
  ): Promise<PersonResponseDto> {
    const normalized = normalizeCpf(dto.documentRef);

    return this.withTenantTransaction(tenantId, async (client) => {
      const existing = await this.repository.findPersonByDocument(normalized, client);
      if (existing) {
        throw new PersonDocumentConflictError(dto.documentRef);
      }

      const person = Person.create({
        tenantId,
        fullName: dto.fullName,
        preferredName: dto.preferredName,
        documentRef: dto.documentRef,
        phone: dto.phone,
        email: dto.email,
      });

      await this.repository.savePerson(person, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Person',
        aggregateId: person.id,
        aggregateVersion: person.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'PersonCreated',
        payload: toIntegrationPayload({
          id: person.id,
          tenantId: person.tenantId,
          fullName: person.fullName,
          documentRef: person.documentRef,
          status: person.status,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'PERSON_CREATED',
          'Person',
          person.id,
          JSON.stringify({ fullName: person.fullName, documentRef: person.documentRef }),
        ],
      );

      return this.toPersonDto(person);
    });
  }

  async updatePerson(
    tenantId: string,
    id: string,
    dto: UpdatePersonDto,
    actorId = 'system',
  ): Promise<PersonResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const person = await this.repository.findPersonById(id, client);
      if (!person) {
        throw new PersonNotFoundError(id);
      }

      const before = { fullName: person.fullName, phone: person.phone, email: person.email };
      person.update(dto);

      await this.repository.savePerson(person, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Person',
        aggregateId: person.id,
        aggregateVersion: person.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'PersonUpdated',
        payload: toIntegrationPayload({
          id: person.id,
          tenantId: person.tenantId,
          fullName: person.fullName,
          version: person.version,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, before_state, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'PERSON_UPDATED',
          'Person',
          person.id,
          JSON.stringify(before),
          JSON.stringify({ fullName: person.fullName, phone: person.phone, email: person.email }),
        ],
      );

      return this.toPersonDto(person);
    });
  }

  async findPersonById(tenantId: string, id: string): Promise<PersonResponseDto> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const person = await this.repository.findPersonById(id, client);
      if (!person) throw new PersonNotFoundError(id);
      return this.toPersonDto(person);
    } finally {
      client.release();
    }
  }

  async listPeople(
    tenantId: string,
    filter?: ListPeopleFilter,
  ): Promise<{ items: PersonResponseDto[]; total: number }> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const res = await this.repository.listPeople(filter, client);
      return {
        items: res.items.map((p) => this.toPersonDto(p)),
        total: res.total,
      };
    } finally {
      client.release();
    }
  }

  // --- EMPLOYEE ---

  async createEmployee(
    tenantId: string,
    dto: CreateEmployeeDto,
    actorId = 'system',
  ): Promise<EmployeeResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const person = await this.repository.findPersonById(dto.personId, client);
      if (!person) {
        throw new PersonNotFoundError(dto.personId);
      }

      const existingEmployee = await this.repository.findEmployeeByPersonId(dto.personId, client);
      if (existingEmployee) {
        throw new EmployeeAlreadyExistsError(dto.personId);
      }

      const employee = Employee.create({
        tenantId,
        personId: dto.personId,
        platformAccountStatus: dto.platformAccountStatus,
      });

      await this.repository.saveEmployee(employee, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Employee',
        aggregateId: employee.id,
        aggregateVersion: employee.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'EmployeeCreated',
        payload: toIntegrationPayload({
          id: employee.id,
          tenantId: employee.tenantId,
          personId: employee.personId,
          status: employee.status,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'EMPLOYEE_CREATED',
          'Employee',
          employee.id,
          JSON.stringify({ personId: employee.personId, status: employee.status }),
        ],
      );

      return this.toEmployeeDto(employee);
    });
  }

  async findEmployeeById(tenantId: string, id: string): Promise<EmployeeResponseDto> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const employee = await this.repository.findEmployeeById(id, client);
      if (!employee) throw new EmployeeNotFoundError(id);
      return this.toEmployeeDto(employee);
    } finally {
      client.release();
    }
  }

  async changeEmployeeStatus(
    tenantId: string,
    id: string,
    status: EmployeeStatus,
    reason?: string,
    actorId = 'system',
  ): Promise<EmployeeResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const employee = await this.repository.findEmployeeById(id, client);
      if (!employee) throw new EmployeeNotFoundError(id);

      const previousStatus = employee.status;
      if (status === 'ACTIVE') {
        employee.activate();
      } else if (status === 'INACTIVE') {
        employee.inactivate();
      } else if (status === 'SUSPENDED') {
        employee.suspend(reason ?? '');
      }

      await this.repository.saveEmployee(employee, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Employee',
        aggregateId: employee.id,
        aggregateVersion: employee.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'EmployeeStatusChanged',
        payload: toIntegrationPayload({
          id: employee.id,
          tenantId: employee.tenantId,
          previousStatus,
          newStatus: employee.status,
          reason,
          version: employee.version,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, reason, before_state, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'EMPLOYEE_STATUS_CHANGED',
          'Employee',
          employee.id,
          reason ?? null,
          JSON.stringify({ status: previousStatus }),
          JSON.stringify({ status: employee.status }),
        ],
      );

      return this.toEmployeeDto(employee);
    });
  }

  async listEmployees(
    tenantId: string,
    filter?: ListEmployeesFilter,
  ): Promise<{ items: EmployeeResponseDto[]; total: number }> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const res = await this.repository.listEmployees(filter, client);
      return {
        items: res.items.map((e) => this.toEmployeeDto(e)),
        total: res.total,
      };
    } finally {
      client.release();
    }
  }

  // --- COMPANY EMPLOYMENT ---

  async createEmployment(
    tenantId: string,
    dto: CreateCompanyEmploymentDto,
    actorId = 'system',
  ): Promise<CompanyEmploymentResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const employee = await this.repository.findEmployeeById(dto.employeeId, client);
      if (!employee) throw new EmployeeNotFoundError(dto.employeeId);

      const employment = CompanyEmployment.create({
        tenantId,
        employeeId: dto.employeeId,
        clientCompanyId: dto.clientCompanyId,
        externalEmployeeCode: dto.externalEmployeeCode,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      });

      await this.repository.saveEmployment(employment, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'CompanyEmployment',
        aggregateId: employment.id,
        aggregateVersion: employment.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'CompanyEmploymentCreated',
        payload: toIntegrationPayload({
          id: employment.id,
          tenantId: employment.tenantId,
          employeeId: employment.employeeId,
          clientCompanyId: employment.clientCompanyId,
          status: employment.status,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'COMPANY_EMPLOYMENT_CREATED',
          'CompanyEmployment',
          employment.id,
          JSON.stringify({
            employeeId: employment.employeeId,
            clientCompanyId: employment.clientCompanyId,
          }),
        ],
      );

      return this.toEmploymentDto(employment);
    });
  }

  async terminateEmployment(
    tenantId: string,
    id: string,
    terminatedAt?: string,
    actorId = 'system',
  ): Promise<CompanyEmploymentResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const employment = await this.repository.findEmploymentById(id, client);
      if (!employment) throw new EmploymentNotFoundError(id);

      employment.terminate(terminatedAt ? new Date(terminatedAt) : undefined);

      await this.repository.saveEmployment(employment, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'CompanyEmployment',
        aggregateId: employment.id,
        aggregateVersion: employment.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'CompanyEmploymentTerminated',
        payload: toIntegrationPayload({
          id: employment.id,
          tenantId: employment.tenantId,
          status: employment.status,
          validTo: employment.validTo?.toISOString(),
          version: employment.version,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'COMPANY_EMPLOYMENT_TERMINATED',
          'CompanyEmployment',
          employment.id,
          JSON.stringify({ status: employment.status, validTo: employment.validTo }),
        ],
      );

      return this.toEmploymentDto(employment);
    });
  }

  async listEmploymentsByCompany(
    tenantId: string,
    clientCompanyId: string,
    filter?: ListEmploymentsFilter,
  ): Promise<CompanyEmploymentResponseDto[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const employments = await this.repository.listEmploymentsByCompany(clientCompanyId, filter, client);
      return employments.map((e) => this.toEmploymentDto(e));
    } finally {
      client.release();
    }
  }

  // --- PROVISIONAL TRANSPORT AUTHORIZATION ---

  async createProvisionalAuthorization(
    tenantId: string,
    dto: CreateProvisionalAuthDto,
    actorId = 'system',
  ): Promise<ProvisionalAuthResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const employee = await this.repository.findEmployeeById(dto.employeeId, client);
      if (!employee) throw new EmployeeNotFoundError(dto.employeeId);

      const auth = ProvisionalTransportAuthorization.create({
        tenantId,
        employeeId: dto.employeeId,
        clientCompanyId: dto.clientCompanyId,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
        approvedBy: toUuidOrNull(actorId) ?? undefined,
        completedReason: dto.completedReason,
      });

      await this.repository.saveProvisionalAuthorization(auth, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'ProvisionalTransportAuthorization',
        aggregateId: auth.id,
        aggregateVersion: auth.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'ProvisionalAuthorizationGranted',
        payload: toIntegrationPayload({
          id: auth.id,
          tenantId: auth.tenantId,
          employeeId: auth.employeeId,
          clientCompanyId: auth.clientCompanyId,
          status: auth.status,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'PROVISIONAL_AUTH_GRANTED',
          'ProvisionalTransportAuthorization',
          auth.id,
          JSON.stringify({
            employeeId: auth.employeeId,
            clientCompanyId: auth.clientCompanyId,
            validFrom: auth.validFrom,
            validTo: auth.validTo,
          }),
        ],
      );

      return this.toProvisionalAuthDto(auth);
    });
  }

  async revokeProvisionalAuthorization(
    tenantId: string,
    id: string,
    reason: string,
    actorId = 'system',
  ): Promise<ProvisionalAuthResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const auth = await this.repository.findProvisionalAuthorizationById(id, client);
      if (!auth) throw new ProvisionalAuthNotFoundError(id);

      auth.revoke(reason);

      await this.repository.saveProvisionalAuthorization(auth, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'ProvisionalTransportAuthorization',
        aggregateId: auth.id,
        aggregateVersion: auth.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'ProvisionalAuthorizationRevoked',
        payload: toIntegrationPayload({
          id: auth.id,
          tenantId: auth.tenantId,
          status: auth.status,
          reason,
          version: auth.version,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, reason, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'PROVISIONAL_AUTH_REVOKED',
          'ProvisionalTransportAuthorization',
          auth.id,
          reason,
          JSON.stringify({ status: auth.status }),
        ],
      );

      return this.toProvisionalAuthDto(auth);
    });
  }

  async listProvisionalAuthorizations(
    tenantId: string,
    clientCompanyId?: string,
  ): Promise<ProvisionalAuthResponseDto[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const items = await this.repository.listProvisionalAuthorizations(clientCompanyId, client);
      return items.map((a) => this.toProvisionalAuthDto(a));
    } finally {
      client.release();
    }
  }

  // --- MAPPERS ---

  private toPersonDto(person: Person): PersonResponseDto {
    return {
      id: person.id,
      tenantId: person.tenantId,
      fullName: person.fullName,
      preferredName: person.preferredName,
      documentRef: person.documentRef,
      phone: person.phone,
      email: person.email,
      status: person.status,
      version: person.version,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    };
  }

  private toEmployeeDto(employee: Employee): EmployeeResponseDto {
    return {
      id: employee.id,
      tenantId: employee.tenantId,
      personId: employee.personId,
      platformAccountStatus: employee.platformAccountStatus,
      status: employee.status,
      version: employee.version,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
    };
  }

  private toEmploymentDto(employment: CompanyEmployment): CompanyEmploymentResponseDto {
    return {
      id: employment.id,
      tenantId: employment.tenantId,
      employeeId: employment.employeeId,
      clientCompanyId: employment.clientCompanyId,
      externalEmployeeCode: employment.externalEmployeeCode,
      validFrom: employment.validFrom.toISOString(),
      validTo: employment.validTo?.toISOString(),
      status: employment.status,
      version: employment.version,
      createdAt: employment.createdAt.toISOString(),
      updatedAt: employment.updatedAt.toISOString(),
    };
  }

  private toProvisionalAuthDto(auth: ProvisionalTransportAuthorization): ProvisionalAuthResponseDto {
    return {
      id: auth.id,
      tenantId: auth.tenantId,
      employeeId: auth.employeeId,
      clientCompanyId: auth.clientCompanyId,
      validFrom: auth.validFrom.toISOString(),
      validTo: auth.validTo.toISOString(),
      status: auth.status,
      approvedBy: auth.approvedBy,
      approvedAt: auth.approvedAt.toISOString(),
      completedReason: auth.completedReason,
      version: auth.version,
      createdAt: auth.createdAt.toISOString(),
      updatedAt: auth.updatedAt.toISOString(),
    };
  }

  async createDriver(
    tenantId: string,
    dto: CreateDriverDto,
    actorId = 'system',
  ): Promise<DriverResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const person = await this.repository.findPersonById(dto.personId, client);
      if (!person) {
        throw new PersonNotFoundError(dto.personId);
      }

      const existingByPerson = await this.repository.findDriverByPersonId(dto.personId, client);
      if (existingByPerson) {
        throw new DriverPersonConflictError(dto.personId);
      }

      const existingByLicense = await this.repository.findDriverByLicenseNumber(dto.licenseNumber.trim(), client);
      if (existingByLicense) {
        throw new DriverLicenseConflictError(dto.licenseNumber.trim());
      }

      const expiresAt = typeof dto.licenseExpiresAt === 'string' ? new Date(dto.licenseExpiresAt) : dto.licenseExpiresAt;

      const driver = Driver.create({
        tenantId,
        personId: dto.personId,
        licenseNumber: dto.licenseNumber,
        licenseCategory: dto.licenseCategory,
        licenseExpiresAt: expiresAt,
      });

      await this.repository.saveDriver(driver, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Driver',
        aggregateId: driver.id,
        aggregateVersion: driver.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'DriverCreated',
        payload: toIntegrationPayload({
          id: driver.id,
          tenantId: driver.tenantId,
          personId: driver.personId,
          licenseNumber: driver.licenseNumber,
          licenseCategory: driver.licenseCategory,
          status: driver.status,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'DRIVER_CREATED',
          'Driver',
          driver.id,
          JSON.stringify({
            personId: driver.personId,
            licenseNumber: driver.licenseNumber,
            licenseCategory: driver.licenseCategory,
            status: driver.status,
          }),
        ],
      );

      return this.toDriverDto(driver);
    });
  }

  async updateDriver(
    tenantId: string,
    driverId: string,
    dto: UpdateDriverDto,
    actorId = 'system',
  ): Promise<DriverResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const driver = await this.repository.findDriverById(driverId, client);
      if (!driver) {
        throw new DriverNotFoundError(driverId);
      }

      const beforeState = {
        licenseCategory: driver.licenseCategory,
        licenseExpiresAt: driver.licenseExpiresAt.toISOString(),
      };

      const expiresAt =
        dto.licenseExpiresAt !== undefined
          ? typeof dto.licenseExpiresAt === 'string'
            ? new Date(dto.licenseExpiresAt)
            : dto.licenseExpiresAt
          : undefined;

      driver.update({
        licenseCategory: dto.licenseCategory,
        licenseExpiresAt: expiresAt,
      });

      await this.repository.saveDriver(driver, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Driver',
        aggregateId: driver.id,
        aggregateVersion: driver.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'DriverUpdated',
        payload: toIntegrationPayload({
          id: driver.id,
          tenantId: driver.tenantId,
          licenseCategory: driver.licenseCategory,
          licenseExpiresAt: driver.licenseExpiresAt.toISOString(),
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, before_state, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'DRIVER_UPDATED',
          'Driver',
          driver.id,
          JSON.stringify(beforeState),
          JSON.stringify({
            licenseCategory: driver.licenseCategory,
            licenseExpiresAt: driver.licenseExpiresAt.toISOString(),
          }),
        ],
      );

      return this.toDriverDto(driver);
    });
  }

  async suspendDriver(
    tenantId: string,
    driverId: string,
    dto: SuspendDriverDto,
    actorId = 'system',
  ): Promise<DriverResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const driver = await this.repository.findDriverById(driverId, client);
      if (!driver) {
        throw new DriverNotFoundError(driverId);
      }

      driver.suspend(dto.reason);
      await this.repository.saveDriver(driver, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Driver',
        aggregateId: driver.id,
        aggregateVersion: driver.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'DriverSuspended',
        payload: toIntegrationPayload({
          id: driver.id,
          reason: dto.reason,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'DRIVER_SUSPENDED',
          'Driver',
          driver.id,
          JSON.stringify({
            status: driver.status,
            suspensionReason: driver.suspensionReason,
          }),
        ],
      );

      return this.toDriverDto(driver);
    });
  }

  async reactivateDriver(
    tenantId: string,
    driverId: string,
    actorId = 'system',
  ): Promise<DriverResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const driver = await this.repository.findDriverById(driverId, client);
      if (!driver) {
        throw new DriverNotFoundError(driverId);
      }

      driver.reactivate();
      await this.repository.saveDriver(driver, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Driver',
        aggregateId: driver.id,
        aggregateVersion: driver.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'DriverReactivated',
        payload: toIntegrationPayload({
          id: driver.id,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'DRIVER_REACTIVATED',
          'Driver',
          driver.id,
          JSON.stringify({ status: driver.status }),
        ],
      );

      return this.toDriverDto(driver);
    });
  }

  async attachDriverDocument(
    tenantId: string,
    driverId: string,
    dto: AttachDriverDocumentDto,
    actorId = 'system',
  ): Promise<DriverDocumentResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const driver = await this.repository.findDriverById(driverId, client);
      if (!driver) {
        throw new DriverNotFoundError(driverId);
      }

      const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
      const document = DriverDocument.create({
        tenantId,
        driverId,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
        expiresAt,
        metadata: dto.metadata,
      });

      await this.repository.saveDriverDocument(document, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Driver',
        aggregateId: driver.id,
        aggregateVersion: driver.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'DriverDocumentAttached',
        payload: toIntegrationPayload({
          id: document.id,
          driverId: document.driverId,
          documentType: document.documentType,
          documentNumber: document.documentNumber,
          status: document.status,
          expiresAt: document.expiresAt?.toISOString(),
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'DRIVER_DOCUMENT_ATTACHED',
          'DriverDocument',
          document.id,
          JSON.stringify({
            driverId,
            documentType: document.documentType,
            documentNumber: document.documentNumber,
            status: document.status,
          }),
        ],
      );

      return this.toDriverDocumentDto(document);
    });
  }

  async findDriverById(tenantId: string, driverId: string): Promise<DriverResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const driver = await this.repository.findDriverById(driverId, client);
      if (!driver) {
        throw new DriverNotFoundError(driverId);
      }
      return this.toDriverDto(driver);
    });
  }

  async listDrivers(
    tenantId: string,
    filter?: ListDriversFilter,
  ): Promise<{ items: DriverResponseDto[]; total: number }> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const result = await this.repository.listDrivers(filter, client);
      return {
        items: result.items.map((d) => this.toDriverDto(d)),
        total: result.total,
      };
    });
  }

  async listDriverEligibilities(
    tenantId: string,
    driverId: string,
  ): Promise<DriverEligibilityRecord[]> {
    return this.withTenantTransaction(tenantId, async (client) => {
      return this.repository.listDriverEligibilities(driverId, client);
    });
  }

  private toDriverDto(driver: Driver): DriverResponseDto {
    return {
      id: driver.id,
      tenantId: driver.tenantId,
      personId: driver.personId,
      licenseNumber: driver.licenseNumber,
      licenseCategory: driver.licenseCategory,
      licenseExpiresAt: driver.licenseExpiresAt.toISOString(),
      status: driver.status,
      suspensionReason: driver.suspensionReason,
      version: driver.version,
      createdAt: driver.createdAt.toISOString(),
      updatedAt: driver.updatedAt.toISOString(),
      documents: driver.driverDocuments.map((doc) => this.toDriverDocumentDto(doc)),
    };
  }

  private toDriverDocumentDto(doc: DriverDocument): DriverDocumentResponseDto {
    return {
      id: doc.id,
      tenantId: doc.tenantId,
      driverId: doc.driverId,
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      expiresAt: doc.expiresAt?.toISOString(),
      status: doc.status,
      metadata: doc.metadata,
      version: doc.version,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}

