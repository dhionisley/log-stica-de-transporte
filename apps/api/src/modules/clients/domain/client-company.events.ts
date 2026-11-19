import type { JsonValue } from '../../outbox/application/messaging.types';
import type { ClientCompanyStatus } from './client-company.entity';

export interface ClientCompanyCreatedPayload {
  id: string;
  tenantId: string;
  legalName: string;
  commercialName: string;
  taxId: string;
  status: ClientCompanyStatus;
}

export interface ClientCompanyUpdatedPayload {
  id: string;
  tenantId: string;
  legalName: string;
  commercialName: string;
  taxId: string;
  status: ClientCompanyStatus;
  version: number;
}

export interface ClientCompanyStatusChangedPayload {
  id: string;
  tenantId: string;
  previousStatus: ClientCompanyStatus;
  newStatus: ClientCompanyStatus;
  reason?: string;
  version: number;
}

export function toIntegrationPayload<T extends Record<string, unknown>>(data: T): JsonValue {
  return data as unknown as JsonValue;
}