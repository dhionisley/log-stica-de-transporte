import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import {
  Person,
  PersonDomainError,
  type PersonProps,
  type PersonStatus,
} from '../domain/person.entity';
import {
  Employee,
  EmployeeDomainError,
  type EmployeeProps,
  type EmployeeStatus,
  type PlatformAccountStatus,
} from '../domain/employee.entity';
import {
  CompanyEmployment,
  CompanyEmploymentDomainError,
  type CompanyEmploymentProps,
  type EmploymentStatus,
} from '../domain/company-employment.entity';
import {
  ProvisionalTransportAuthorization,
  ProvisionalAuthorizationDomainError,
  type ProvisionalAuthStatus,
  type ProvisionalTransportAuthorizationProps,
} from '../domain/provisional-transport-authorization.entity';
import type {
  IWorkforceRepository,
  ListEmployeesFilter,
  ListEmploymentsFilter,
  ListPeopleFilter,
} from '../domain/workforce.repository';

interface PersonRow {
  id: string;
  tenant_id: string;
  full_name: string;
  preferred_name: string | null;
  document_ref: string;
  phone: string | null;
  email: string | null;
  status: PersonStatus;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

interface EmployeeRow {
  id: string;
  tenant_id: string;
  person_id: string;
  platform_account_status: PlatformAccountStatus;
  status: EmployeeStatus;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

interface EmploymentRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  client_company_id: string;
  external_employee_code: string | null;
  valid_from: Date;
  valid_to: Date | null;
  status: EmploymentStatus;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

interface ProvisionalAuthRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  client_company_id: string;
  valid_from: Date;
  valid_to: Date;
  status: ProvisionalAuthStatus;
  approved_by: string | null;
  approved_at: Date;
  completed_reason: string | null;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PostgresWorkforceRepository implements IWorkforceRepository {
  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
  ) {}

  private getRunner(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // --- PERSON ---

  async savePerson(person: Person, client?: PoolClient): Promise<void> {
    const runner = this.getRunner(client);
    const existing = await runner.query<{ version: string | number }>(
      `SELECT version FROM workforce.people WHERE id = $1`,
      [person.id],
    );

    if (existing.rows.length === 0) {
      await runner.query(
        `INSERT INTO workforce.people (
           id, tenant_id, full_name, preferred_name, document_ref, phone, email,
           status, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          person.id,
          person.tenantId,
          person.fullName,
          person.preferredName ?? null,
          person.documentRef,
          person.phone ?? null,
          person.email ?? null,
          person.status,
          person.version,
          person.createdAt,
          person.updatedAt,
        ],
      );
    } else {
      const updateRes = await runner.query(
        `UPDATE workforce.people SET
           full_name = $1,
           preferred_name = $2,
           phone = $3,
           email = $4,
           status = $5,
           version = version + 1,
           updated_at = $6
         WHERE id = $7 AND tenant_id = $8 AND version = $9
         RETURNING version`,
        [
          person.fullName,
          person.preferredName ?? null,
          person.phone ?? null,
          person.email ?? null,
          person.status,
          person.updatedAt,
          person.id,
          person.tenantId,
          person.version,
        ],
      );

      if (updateRes.rowCount === 0) {
        throw new PersonDomainError(
          `Concurrency conflict: person ${person.id} has been modified concurrently`,
        );
      }
    }
  }

  async findPersonById(id: string, client?: PoolClient): Promise<Person | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<PersonRow>(
      `SELECT id, tenant_id, full_name, preferred_name, document_ref, phone, email,
              status, version, created_at, updated_at
       FROM workforce.people
       WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapToPerson(res.rows[0]);
  }

  async findPersonByDocument(documentRef: string, client?: PoolClient): Promise<Person | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<PersonRow>(
      `SELECT id, tenant_id, full_name, preferred_name, document_ref, phone, email,
              status, version, created_at, updated_at
       FROM workforce.people
       WHERE document_ref = $1`,
      [documentRef],
    );
    if (res.rows.length === 0) return null;
    return this.mapToPerson(res.rows[0]);
  }

  async listPeople(
    filter?: ListPeopleFilter,
    client?: PoolClient,
  ): Promise<{ items: Person[]; total: number }> {
    const runner = this.getRunner(client);
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }
    if (filter?.search) {
      conditions.push(`(full_name ILIKE $${paramIndex} OR document_ref ILIKE $${paramIndex})`);
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const countRes = await runner.query<{ count: string }>(
      `SELECT count(*)::text as count FROM workforce.people WHERE ${whereClause}`,
      params,
    );
    const total = Number.parseInt(countRes.rows[0]?.count ?? '0', 10);

    const limit = filter?.limit ?? 20;
    const offset = filter?.offset ?? 0;
    const queryParams = [...params, limit, offset];

    const res = await runner.query<PersonRow>(
      `SELECT id, tenant_id, full_name, preferred_name, document_ref, phone, email,
              status, version, created_at, updated_at
       FROM workforce.people
       WHERE ${whereClause}
       ORDER BY full_name ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      queryParams,
    );

    return {
      items: res.rows.map((r) => this.mapToPerson(r)),
      total,
    };
  }

  // --- EMPLOYEE ---

  async saveEmployee(employee: Employee, client?: PoolClient): Promise<void> {
    const runner = this.getRunner(client);
    const existing = await runner.query<{ version: string | number }>(
      `SELECT version FROM workforce.employees WHERE id = $1`,
      [employee.id],
    );

    if (existing.rows.length === 0) {
      await runner.query(
        `INSERT INTO workforce.employees (
           id, tenant_id, person_id, platform_account_status, status, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          employee.id,
          employee.tenantId,
          employee.personId,
          employee.platformAccountStatus,
          employee.status,
          employee.version,
          employee.createdAt,
          employee.updatedAt,
        ],
      );
    } else {
      const updateRes = await runner.query(
        `UPDATE workforce.employees SET
           platform_account_status = $1,
           status = $2,
           version = version + 1,
           updated_at = $3
         WHERE id = $4 AND tenant_id = $5 AND version = $6
         RETURNING version`,
        [
          employee.platformAccountStatus,
          employee.status,
          employee.updatedAt,
          employee.id,
          employee.tenantId,
          employee.version,
        ],
      );

      if (updateRes.rowCount === 0) {
        throw new EmployeeDomainError(
          `Concurrency conflict: employee ${employee.id} has been modified concurrently`,
        );
      }
    }
  }

  async findEmployeeById(id: string, client?: PoolClient): Promise<Employee | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<EmployeeRow>(
      `SELECT id, tenant_id, person_id, platform_account_status, status, version, created_at, updated_at
       FROM workforce.employees
       WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapToEmployee(res.rows[0]);
  }

  async findEmployeeByPersonId(personId: string, client?: PoolClient): Promise<Employee | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<EmployeeRow>(
      `SELECT id, tenant_id, person_id, platform_account_status, status, version, created_at, updated_at
       FROM workforce.employees
       WHERE person_id = $1`,
      [personId],
    );
    if (res.rows.length === 0) return null;
    return this.mapToEmployee(res.rows[0]);
  }

  async listEmployees(
    filter?: ListEmployeesFilter,
    client?: PoolClient,
  ): Promise<{ items: Employee[]; total: number }> {
    const runner = this.getRunner(client);
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }

    const whereClause = conditions.join(' AND ');
    const countRes = await runner.query<{ count: string }>(
      `SELECT count(*)::text as count FROM workforce.employees WHERE ${whereClause}`,
      params,
    );
    const total = Number.parseInt(countRes.rows[0]?.count ?? '0', 10);

    const limit = filter?.limit ?? 20;
    const offset = filter?.offset ?? 0;
    const queryParams = [...params, limit, offset];

    const res = await runner.query<EmployeeRow>(
      `SELECT id, tenant_id, person_id, platform_account_status, status, version, created_at, updated_at
       FROM workforce.employees
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      queryParams,
    );

    return {
      items: res.rows.map((r) => this.mapToEmployee(r)),
      total,
    };
  }

  // --- COMPANY EMPLOYMENT ---

  async saveEmployment(employment: CompanyEmployment, client?: PoolClient): Promise<void> {
    const runner = this.getRunner(client);
    const existing = await runner.query<{ version: string | number }>(
      `SELECT version FROM workforce.company_employments WHERE id = $1`,
      [employment.id],
    );

    if (existing.rows.length === 0) {
      await runner.query(
        `INSERT INTO workforce.company_employments (
           id, tenant_id, employee_id, client_company_id, external_employee_code,
           valid_from, valid_to, status, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          employment.id,
          employment.tenantId,
          employment.employeeId,
          employment.clientCompanyId,
          employment.externalEmployeeCode ?? null,
          employment.validFrom,
          employment.validTo ?? null,
          employment.status,
          employment.version,
          employment.createdAt,
          employment.updatedAt,
        ],
      );
    } else {
      const updateRes = await runner.query(
        `UPDATE workforce.company_employments SET
           external_employee_code = $1,
           valid_from = $2,
           valid_to = $3,
           status = $4,
           version = version + 1,
           updated_at = $5
         WHERE id = $6 AND tenant_id = $7 AND version = $8
         RETURNING version`,
        [
          employment.externalEmployeeCode ?? null,
          employment.validFrom,
          employment.validTo ?? null,
          employment.status,
          employment.updatedAt,
          employment.id,
          employment.tenantId,
          employment.version,
        ],
      );

      if (updateRes.rowCount === 0) {
        throw new CompanyEmploymentDomainError(
          `Concurrency conflict: employment ${employment.id} has been modified concurrently`,
        );
      }
    }
  }

  async findEmploymentById(id: string, client?: PoolClient): Promise<CompanyEmployment | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<EmploymentRow>(
      `SELECT id, tenant_id, employee_id, client_company_id, external_employee_code,
              valid_from, valid_to, status, version, created_at, updated_at
       FROM workforce.company_employments
       WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapToEmployment(res.rows[0]);
  }

  async listEmploymentsByCompany(
    clientCompanyId: string,
    filter?: ListEmploymentsFilter,
    client?: PoolClient,
  ): Promise<CompanyEmployment[]> {
    const runner = this.getRunner(client);
    const conditions: string[] = ['client_company_id = $1'];
    const params: unknown[] = [clientCompanyId];
    let paramIndex = 2;

    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }
    if (filter?.activeOnly) {
      conditions.push(`status = 'ACTIVE' AND valid_from <= now() AND (valid_to IS NULL OR valid_to >= now())`);
    }

    const whereClause = conditions.join(' AND ');
    const res = await runner.query<EmploymentRow>(
      `SELECT id, tenant_id, employee_id, client_company_id, external_employee_code,
              valid_from, valid_to, status, version, created_at, updated_at
       FROM workforce.company_employments
       WHERE ${whereClause}
       ORDER BY valid_from DESC`,
      params,
    );

    return res.rows.map((r) => this.mapToEmployment(r));
  }

  async listEmploymentsByEmployee(
    employeeId: string,
    client?: PoolClient,
  ): Promise<CompanyEmployment[]> {
    const runner = this.getRunner(client);
    const res = await runner.query<EmploymentRow>(
      `SELECT id, tenant_id, employee_id, client_company_id, external_employee_code,
              valid_from, valid_to, status, version, created_at, updated_at
       FROM workforce.company_employments
       WHERE employee_id = $1
       ORDER BY valid_from DESC`,
      [employeeId],
    );

    return res.rows.map((r) => this.mapToEmployment(r));
  }

  // --- PROVISIONAL AUTHORIZATIONS ---

  async saveProvisionalAuthorization(
    auth: ProvisionalTransportAuthorization,
    client?: PoolClient,
  ): Promise<void> {
    const runner = this.getRunner(client);
    const existing = await runner.query<{ version: string | number }>(
      `SELECT version FROM workforce.provisional_transport_authorizations WHERE id = $1`,
      [auth.id],
    );

    if (existing.rows.length === 0) {
      await runner.query(
        `INSERT INTO workforce.provisional_transport_authorizations (
           id, tenant_id, employee_id, client_company_id, valid_from, valid_to,
           status, approved_by, approved_at, completed_reason, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          auth.id,
          auth.tenantId,
          auth.employeeId,
          auth.clientCompanyId,
          auth.validFrom,
          auth.validTo,
          auth.status,
          auth.approvedBy ?? null,
          auth.approvedAt,
          auth.completedReason ?? null,
          auth.version,
          auth.createdAt,
          auth.updatedAt,
        ],
      );
    } else {
      const updateRes = await runner.query(
        `UPDATE workforce.provisional_transport_authorizations SET
           status = $1,
           completed_reason = $2,
           version = version + 1,
           updated_at = $3
         WHERE id = $4 AND tenant_id = $5 AND version = $6
         RETURNING version`,
        [
          auth.status,
          auth.completedReason ?? null,
          auth.updatedAt,
          auth.id,
          auth.tenantId,
          auth.version,
        ],
      );

      if (updateRes.rowCount === 0) {
        throw new ProvisionalAuthorizationDomainError(
          `Concurrency conflict: provisional authorization ${auth.id} has been modified concurrently`,
        );
      }
    }
  }

  async findProvisionalAuthorizationById(
    id: string,
    client?: PoolClient,
  ): Promise<ProvisionalTransportAuthorization | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<ProvisionalAuthRow>(
      `SELECT id, tenant_id, employee_id, client_company_id, valid_from, valid_to,
              status, approved_by, approved_at, completed_reason, version, created_at, updated_at
       FROM workforce.provisional_transport_authorizations
       WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapToProvisionalAuth(res.rows[0]);
  }

  async listProvisionalAuthorizations(
    clientCompanyId?: string,
    client?: PoolClient,
  ): Promise<ProvisionalTransportAuthorization[]> {
    const runner = this.getRunner(client);
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (clientCompanyId) {
      conditions.push(`client_company_id = $${paramIndex++}`);
      params.push(clientCompanyId);
    }

    const whereClause = conditions.join(' AND ');
    const res = await runner.query<ProvisionalAuthRow>(
      `SELECT id, tenant_id, employee_id, client_company_id, valid_from, valid_to,
              status, approved_by, approved_at, completed_reason, version, created_at, updated_at
       FROM workforce.provisional_transport_authorizations
       WHERE ${whereClause}
       ORDER BY valid_from DESC`,
      params,
    );

    return res.rows.map((r) => this.mapToProvisionalAuth(r));
  }

  // --- MAPPERS ---

  private mapToPerson(row: PersonRow): Person {
    const props: PersonProps = {
      id: row.id,
      tenantId: row.tenant_id,
      fullName: row.full_name,
      preferredName: row.preferred_name ?? undefined,
      documentRef: row.document_ref,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      status: row.status,
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return Person.reconstitute(props);
  }

  private mapToEmployee(row: EmployeeRow): Employee {
    const props: EmployeeProps = {
      id: row.id,
      tenantId: row.tenant_id,
      personId: row.person_id,
      platformAccountStatus: row.platform_account_status,
      status: row.status,
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return Employee.reconstitute(props);
  }

  private mapToEmployment(row: EmploymentRow): CompanyEmployment {
    const props: CompanyEmploymentProps = {
      id: row.id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      clientCompanyId: row.client_company_id,
      externalEmployeeCode: row.external_employee_code ?? undefined,
      validFrom: row.valid_from,
      validTo: row.valid_to ?? undefined,
      status: row.status,
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return CompanyEmployment.reconstitute(props);
  }

  private mapToProvisionalAuth(row: ProvisionalAuthRow): ProvisionalTransportAuthorization {
    const props: ProvisionalTransportAuthorizationProps = {
      id: row.id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      clientCompanyId: row.client_company_id,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      status: row.status,
      approvedBy: row.approved_by ?? undefined,
      approvedAt: row.approved_at,
      completedReason: row.completed_reason ?? undefined,
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return ProvisionalTransportAuthorization.reconstitute(props);
  }
}
