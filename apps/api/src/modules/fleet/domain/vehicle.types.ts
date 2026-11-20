export type VehicleCategory = 'CAR' | 'VAN' | 'MINIBUS' | 'BUS';
export type VehicleStatus = 'ACTIVE' | 'INACTIVE';
export type OperationalStatus = 'AVAILABLE' | 'IN_MAINTENANCE' | 'OUT_OF_SERVICE';
export type DocumentStatus = 'VALID' | 'EXPIRED' | 'PENDING';

export class VehicleDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VehicleDomainError';
  }
}

/**
 * Normaliza placa veicular para formato padrão sem traços, pontos ou espaços, em maiúsculas.
 * Ex: "abc-1234" -> "ABC1234", "bra2e19" -> "BRA2E19"
 */
export function normalizePlate(plate: string): string {
  return (plate ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Valida formato da placa brasileira (padrão tradicional ABC1234 ou Mercosul ABC1D23).
 */
export function validatePlate(plate: string): boolean {
  const normalized = normalizePlate(plate);
  if (normalized.length !== 7) {
    return false;
  }
  const traditionalRegex = /^[A-Z]{3}[0-9]{4}$/;
  const mercosulRegex = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
  return traditionalRegex.test(normalized) || mercosulRegex.test(normalized);
}
