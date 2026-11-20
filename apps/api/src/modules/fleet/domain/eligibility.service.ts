import type { Vehicle } from './vehicle.entity';
import type { VehicleCategory } from './vehicle.types';
import type { Driver } from '../../workforce/domain/driver.entity';
import type { DriverLicenseCategory } from '../../workforce/domain/driver.types';

export interface EligibilityEvaluationResult {
  isEligible: boolean;
  evaluatedAt: Date;
  reasons: string[];
  driverId?: string;
  vehicleId?: string;
}

export class EligibilityService {
  /**
   * Avalia compatibilidade entre a categoria de CNH do condutor e a categoria do veículo.
   * Regras de Trânsito Brasileiras (CTB):
   * - CAR: aceita B, C, D, E e combinações A (AB, AC, AD, AE)
   * - VAN: aceita C, D, E, AC, AD, AE (e B para vans leves/passageiros até capacidade padrão)
   * - MINIBUS: transporte coletivo de passageiros exige D ou E (e AD, AE)
   * - BUS: exige D ou E (e AD, AE)
   */
  static isLicenseCompatible(
    driverCategory: DriverLicenseCategory,
    vehicleCategory: VehicleCategory,
  ): boolean {
    const hasCategoryDOrE = ['D', 'E', 'AD', 'AE'].includes(driverCategory);
    const hasCategoryCOrAbove = ['C', 'D', 'E', 'AC', 'AD', 'AE'].includes(driverCategory);
    const hasCategoryBOrAbove = ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'].includes(driverCategory);

    switch (vehicleCategory) {
      case 'BUS':
      case 'MINIBUS':
        return hasCategoryDOrE;
      case 'VAN':
        return hasCategoryCOrAbove || hasCategoryBOrAbove;
      case 'CAR':
        return hasCategoryBOrAbove;
      default:
        return false;
    }
  }

  /**
   * Avalia elegibilidade operacional de um motorista para uma determinada data.
   */
  static evaluateDriver(driver: Driver, atDate: Date = new Date()): EligibilityEvaluationResult {
    const reasons: string[] = [];

    if (driver.status === 'SUSPENDED') {
      reasons.push('DRIVER_SUSPENDED');
    } else if (driver.status === 'INACTIVE') {
      reasons.push('DRIVER_INACTIVE');
    }

    if (driver.isLicenseExpired(atDate)) {
      reasons.push('DRIVER_LICENSE_EXPIRED');
    }

    // Validação de documentos do motorista
    for (const doc of driver.driverDocuments) {
      if (doc.status === 'EXPIRED' || doc.isExpired(atDate)) {
        reasons.push(`DRIVER_DOCUMENT_EXPIRED:${doc.documentType}`);
      }
    }

    return {
      isEligible: reasons.length === 0,
      evaluatedAt: atDate,
      reasons,
      driverId: driver.id,
    };
  }

  /**
   * Avalia elegibilidade operacional de um veículo para uma determinada data.
   */
  static evaluateVehicle(vehicle: Vehicle, atDate: Date = new Date()): EligibilityEvaluationResult {
    const reasons: string[] = [];

    if (vehicle.status === 'INACTIVE') {
      reasons.push('VEHICLE_INACTIVE');
    }

    if (vehicle.operationalStatus !== 'AVAILABLE') {
      reasons.push(`VEHICLE_NOT_AVAILABLE:${vehicle.operationalStatus}`);
    }

    // Validação de documentos do veículo
    for (const doc of vehicle.vehicleDocuments) {
      if (doc.status === 'EXPIRED' || doc.isExpired(atDate)) {
        reasons.push(`VEHICLE_DOCUMENT_EXPIRED:${doc.documentType}`);
      }
    }

    return {
      isEligible: reasons.length === 0,
      evaluatedAt: atDate,
      reasons,
      vehicleId: vehicle.id,
    };
  }

  /**
   * Avalia a prontidão do par (Motorista, Veículo) para execução de transporte.
   */
  static evaluatePair(
    driver: Driver,
    vehicle: Vehicle,
    atDate: Date = new Date(),
  ): EligibilityEvaluationResult {
    const driverResult = this.evaluateDriver(driver, atDate);
    const vehicleResult = this.evaluateVehicle(vehicle, atDate);
    const reasons = [...driverResult.reasons, ...vehicleResult.reasons];

    if (!this.isLicenseCompatible(driver.licenseCategory, vehicle.category)) {
      reasons.push('DRIVER_LICENSE_INCOMPATIBLE');
    }

    return {
      isEligible: reasons.length === 0,
      evaluatedAt: atDate,
      reasons,
      driverId: driver.id,
      vehicleId: vehicle.id,
    };
  }
}
