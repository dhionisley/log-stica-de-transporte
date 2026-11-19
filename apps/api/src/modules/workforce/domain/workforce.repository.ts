import type { PoolClient } from 'pg';
import type { Person } from './person.entity';
import type { Employee } from './employee.entity';
import type { CompanyEmployment } from './company-employment.entity';
import type { ProvisionalTransportAuthorization } from './provisional-transport-authorization.entity';

export interface ListPeopleFilter {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListEmployeesFilter {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ListEmploymentsFilter {
  status?: string;
  activeOnly?: boolean;
}

export interface IWorkforceRepository {
  savePerson(person: Person, client?: PoolClient): Promise<void>;
  findPersonById(id: string, client?: PoolClient): Promise<Person | null>;
  findPersonByDocument(documentRef: string, client?: PoolClient): Promise<Person | null>;
  listPeople(filter?: ListPeopleFilter, client?: PoolClient): Promise<{ items: Person[]; total: number }>;

  saveEmployee(employee: Employee, client?: PoolClient): Promise<void>;
  findEmployeeById(id: string, client?: PoolClient): Promise<Employee | null>;
  findEmployeeByPersonId(personId: string, client?: PoolClient): Promise<Employee | null>;
  listEmployees(filter?: ListEmployeesFilter, client?: PoolClient): Promise<{ items: Employee[]; total: number }>;

  saveEmployment(employment: CompanyEmployment, client?: PoolClient): Promise<void>;
  findEmploymentById(id: string, client?: PoolClient): Promise<CompanyEmployment | null>;
  listEmploymentsByCompany(clientCompanyId: string, filter?: ListEmploymentsFilter, client?: PoolClient): Promise<CompanyEmployment[]>;
  listEmploymentsByEmployee(employeeId: string, client?: PoolClient): Promise<CompanyEmployment[]>;

  saveProvisionalAuthorization(auth: ProvisionalTransportAuthorization, client?: PoolClient): Promise<void>;
  findProvisionalAuthorizationById(id: string, client?: PoolClient): Promise<ProvisionalTransportAuthorization | null>;
  listProvisionalAuthorizations(clientCompanyId?: string, client?: PoolClient): Promise<ProvisionalTransportAuthorization[]>;
}

export const WORKFORCE_REPOSITORY_TOKEN = Symbol('IWorkforceRepository');
