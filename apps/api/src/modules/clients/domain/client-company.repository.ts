import type { PoolClient } from 'pg';
import type { ClientCompany, ClientCompanyStatus } from './client-company.entity';

export interface ListClientCompaniesFilter {
  status?: ClientCompanyStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListClientCompaniesResult {
  items: ClientCompany[];
  total: number;
}

export interface IClientCompanyRepository {
  save(company: ClientCompany, client?: PoolClient): Promise<void>;
  findById(id: string, client?: PoolClient): Promise<ClientCompany | null>;
  findByTaxId(taxId: string, client?: PoolClient): Promise<ClientCompany | null>;
  list(filter?: ListClientCompaniesFilter, client?: PoolClient): Promise<ListClientCompaniesResult>;
}

export const CLIENT_COMPANY_REPOSITORY_TOKEN = Symbol('IClientCompanyRepository');

