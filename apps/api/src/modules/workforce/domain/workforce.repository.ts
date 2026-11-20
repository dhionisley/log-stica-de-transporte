import type { PoolClient } from 'pg';
import type { Person } from './person.entity';
import type { Employee } from './employee.entity';
import type { CompanyEmployment } from './company-employment.entity';
import type { ProvisionalTransportAuthorization } from './provisional-transport-authorization.entity';
import type { Driver } from './driver.entity';
import type { DriverDocument } from './driver-document.entity';
import type { DriverStatus } from './driver.types';

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

export interface ListDriversFilter {
  status?: DriverStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DriverEligibilityRecord {
  id: string;
  tenantId: string;
  driverId: string;
  evaluatedAt: Date;
  isEligible: boolean;
  reasons: string[];
  evaluatedBy?: string;
  createdAt: Date;
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

  saveDriver(driver: Driver, client?: PoolClient): Promise<void>;
  findDriverById(id: string, client?: PoolClient): Promise<Driver | null>;
  findDriverByPersonId(personId: string, client?: PoolClient): Promise<Driver | null>;
  findDriverByLicenseNumber(licenseNumber: string, client?: PoolClient): Promise<Driver | null>;
  listDrivers(filter?: ListDriversFilter, client?: PoolClient): Promise<{ items: Driver[]; total: number }>;

  saveDriverDocument(document: DriverDocument, client?: PoolClient): Promise<void>;
  findDriverDocumentById(id: string, client?: PoolClient): Promise<DriverDocument | null>;
  listDriverDocuments(driverId: string, client?: PoolClient): Promise<DriverDocument[]>;

  saveDriverEligibility(record: Omit<DriverEligibilityRecord, 'id' | 'createdAt'> & { id?: string }, client?: PoolClient): Promise<void>;
  listDriverEligibilities(driverId: string, client?: PoolClient): Promise<DriverEligibilityRecord[]>;
}

export const WORKFORCE_REPOSITORY_TOKEN = Symbol('IWorkforceRepository');

