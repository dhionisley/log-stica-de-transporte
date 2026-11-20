import { Vehicle } from '../src/modules/fleet/domain/vehicle.entity';
import { VehicleDocument } from '../src/modules/fleet/domain/vehicle-document.entity';
import { normalizePlate, validatePlate, VehicleDomainError } from '../src/modules/fleet/domain/vehicle.types';
import { EligibilityService } from '../src/modules/fleet/domain/eligibility.service';
import { Driver } from '../src/modules/workforce/domain/driver.entity';

describe('Fleet & Vehicle Domain', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';

  describe('Plate Normalization & Validation', () => {
    it('normalizes plate formats removing spaces and hyphens', () => {
      expect(normalizePlate('abc-1234')).toBe('ABC1234');
      expect(normalizePlate('bra 2e19')).toBe('BRA2E19');
      expect(normalizePlate('  xyz-9k88  ')).toBe('XYZ9K88');
    });

    it('validates traditional and Mercosul plates', () => {
      expect(validatePlate('ABC1234')).toBe(true);
      expect(validatePlate('abc-1234')).toBe(true);
      expect(validatePlate('BRA2E19')).toBe(true);
      expect(validatePlate('bra-2e19')).toBe(true);

      expect(validatePlate('INVALID')).toBe(false);
      expect(validatePlate('1234567')).toBe(false);
      expect(validatePlate('ABCD123')).toBe(false);
    });
  });

  describe('Vehicle Entity', () => {
    it('creates a valid vehicle with initial AVAILABLE status', () => {
      const vehicle = Vehicle.create({
        tenantId,
        fleetCode: 'BUS-001',
        plate: 'ABC-1234',
        category: 'BUS',
        capacity: 44,
        accessibilityFeatures: ['WHEELCHAIR_LIFT'],
      });

      expect(vehicle.id).toBeDefined();
      expect(vehicle.tenantId).toBe(tenantId);
      expect(vehicle.fleetCode).toBe('BUS-001');
      expect(vehicle.plate).toBe('ABC-1234');
      expect(vehicle.plateNormalized).toBe('ABC1234');
      expect(vehicle.category).toBe('BUS');
      expect(vehicle.capacity).toBe(44);
      expect(vehicle.status).toBe('ACTIVE');
      expect(vehicle.operationalStatus).toBe('AVAILABLE');
      expect(vehicle.odometerKm).toBe(0);
      expect(vehicle.accessibilityFeatures).toEqual(['WHEELCHAIR_LIFT']);
    });

    it('throws when capacity is not positive', () => {
      expect(() => {
        Vehicle.create({
          tenantId,
          fleetCode: 'BUS-002',
          plate: 'ABC-1234',
          capacity: 0,
        });
      }).toThrow(VehicleDomainError);
    });

    it('throws when plate is invalid', () => {
      expect(() => {
        Vehicle.create({
          tenantId,
          fleetCode: 'BUS-003',
          plate: 'INVALID_PLATE',
          capacity: 20,
        });
      }).toThrow(VehicleDomainError);
    });

    it('updates vehicle data and prevents odometer rollback', () => {
      const vehicle = Vehicle.create({
        tenantId,
        fleetCode: 'VAN-10',
        plate: 'BRA2E19',
        category: 'VAN',
        capacity: 15,
        odometerKm: 50000,
      });

      vehicle.update({
        fleetCode: 'VAN-10-MOD',
        odometerKm: 50500,
      });

      expect(vehicle.fleetCode).toBe('VAN-10-MOD');
      expect(vehicle.odometerKm).toBe(50500);

      expect(() => {
        vehicle.update({ odometerKm: 49000 });
      }).toThrow(VehicleDomainError);
    });

    it('changes operational status and handles deactivation', () => {
      const vehicle = Vehicle.create({
        tenantId,
        fleetCode: 'CAR-01',
        plate: 'XYZ9K88',
        category: 'CAR',
        capacity: 4,
      });

      vehicle.setOperationalStatus('IN_MAINTENANCE');
      expect(vehicle.operationalStatus).toBe('IN_MAINTENANCE');

      vehicle.deactivate();
      expect(vehicle.status).toBe('INACTIVE');
      expect(vehicle.operationalStatus).toBe('OUT_OF_SERVICE');

      // Cannot make available while inactive
      expect(() => {
        vehicle.setOperationalStatus('AVAILABLE');
      }).toThrow(VehicleDomainError);

      vehicle.activate();
      expect(vehicle.status).toBe('ACTIVE');
      expect(vehicle.operationalStatus).toBe('AVAILABLE');
    });

    it('attaches documents and tracks expiration', () => {
      const vehicle = Vehicle.create({
        tenantId,
        fleetCode: 'BUS-99',
        plate: 'ABC1234',
        capacity: 40,
      });

      const validDoc = VehicleDocument.create({
        tenantId,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        documentNumber: 'DOC-123',
        expiresAt: new Date(Date.now() + 86400000 * 30),
      });

      expect(validDoc.status).toBe('VALID');
      expect(validDoc.isExpired()).toBe(false);

      vehicle.attachDocument(validDoc);
      expect(vehicle.vehicleDocuments).toHaveLength(1);

      const expiredDoc = VehicleDocument.create({
        tenantId,
        vehicleId: vehicle.id,
        documentType: 'INSURANCE',
        documentNumber: 'INS-999',
        expiresAt: new Date(Date.now() - 86400000),
      });

      expect(expiredDoc.status).toBe('EXPIRED');
      expect(expiredDoc.isExpired()).toBe(true);
    });
  });

  describe('Eligibility Gate Engine', () => {
    const personId = '00000000-0000-0000-0000-000000000002';
    const futureDate = new Date(Date.now() + 86400000 * 365);
    const pastDate = new Date(Date.now() - 86400000 * 10);

    it('blocks driver with expired CNH', () => {
      const expiredDriver = Driver.create({
        tenantId,
        personId,
        licenseNumber: '11111111111',
        licenseCategory: 'D',
        licenseExpiresAt: pastDate,
      });

      const vehicle = Vehicle.create({
        tenantId,
        fleetCode: 'BUS-01',
        plate: 'ABC1234',
        category: 'BUS',
        capacity: 44,
      });

      const result = EligibilityService.evaluatePair(expiredDriver, vehicle);
      expect(result.isEligible).toBe(false);
      expect(result.reasons).toContain('DRIVER_LICENSE_EXPIRED');
    });

    it('blocks suspended driver', () => {
      const driver = Driver.create({
        tenantId,
        personId,
        licenseNumber: '22222222222',
        licenseCategory: 'D',
        licenseExpiresAt: futureDate,
      });
      driver.suspend('Infrações recorrentes');

      const vehicle = Vehicle.create({
        tenantId,
        fleetCode: 'BUS-01',
        plate: 'ABC1234',
        category: 'BUS',
        capacity: 44,
      });

      const result = EligibilityService.evaluatePair(driver, vehicle);
      expect(result.isEligible).toBe(false);
      expect(result.reasons).toContain('DRIVER_SUSPENDED');
    });

    it('blocks vehicle in maintenance or out of service', () => {
      const driver = Driver.create({
        tenantId,
        personId,
        licenseNumber: '33333333333',
        licenseCategory: 'D',
        licenseExpiresAt: futureDate,
      });

      const vehicle = Vehicle.create({
        tenantId,
        fleetCode: 'BUS-01',
        plate: 'ABC1234',
        category: 'BUS',
        capacity: 44,
      });
      vehicle.setOperationalStatus('IN_MAINTENANCE');

      const result = EligibilityService.evaluatePair(driver, vehicle);
      expect(result.isEligible).toBe(false);
      expect(result.reasons).toContain('VEHICLE_NOT_AVAILABLE:IN_MAINTENANCE');
    });

    it('blocks when driver license category is incompatible with vehicle type', () => {
      // Driver has Category B (cars only), vehicle is a BUS
      const carDriver = Driver.create({
        tenantId,
        personId,
        licenseNumber: '44444444444',
        licenseCategory: 'B',
        licenseExpiresAt: futureDate,
      });

      const bus = Vehicle.create({
        tenantId,
        fleetCode: 'BUS-01',
        plate: 'ABC1234',
        category: 'BUS',
        capacity: 44,
      });

      const result = EligibilityService.evaluatePair(carDriver, bus);
      expect(result.isEligible).toBe(false);
      expect(result.reasons).toContain('DRIVER_LICENSE_INCOMPATIBLE');
    });

    it('approves fully compliant driver and vehicle pair', () => {
      const validDriver = Driver.create({
        tenantId,
        personId,
        licenseNumber: '55555555555',
        licenseCategory: 'D',
        licenseExpiresAt: futureDate,
      });

      const validBus = Vehicle.create({
        tenantId,
        fleetCode: 'BUS-01',
        plate: 'ABC1234',
        category: 'BUS',
        capacity: 44,
      });

      const validDoc = VehicleDocument.create({
        tenantId,
        vehicleId: validBus.id,
        documentType: 'CRLV',
        documentNumber: 'CRLV-2026',
        expiresAt: futureDate,
      });
      validBus.attachDocument(validDoc);

      const result = EligibilityService.evaluatePair(validDriver, validBus);
      expect(result.isEligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });
  });
});
