export type DriverLicenseCategory =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'AB'
  | 'AC'
  | 'AD'
  | 'AE';

export type DriverStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type DriverDocumentStatus = 'VALID' | 'EXPIRED' | 'PENDING';

export class DriverDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriverDomainError';
  }
}

export const VALID_LICENSE_CATEGORIES = new Set<DriverLicenseCategory>([
  'A',
  'B',
  'C',
  'D',
  'E',
  'AB',
  'AC',
  'AD',
  'AE',
]);
