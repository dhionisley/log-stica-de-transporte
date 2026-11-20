import { Driver } from '../src/modules/workforce/domain/driver.entity';
import { DriverDocument } from '../src/modules/workforce/domain/driver-document.entity';
import { DriverDomainError, type DriverLicenseCategory } from '../src/modules/workforce/domain/driver.types';

describe('Driver Domain Entity', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const personId = '00000000-0000-0000-0000-000000000002';
  const futureExpiry = new Date(Date.now() + 86400000 * 180);

  it('creates an active driver with valid license', () => {
    const driver = Driver.create({
      tenantId,
      personId,
      licenseNumber: '12345678900',
      licenseCategory: 'AD',
      licenseExpiresAt: futureExpiry,
    });

    expect(driver.id).toBeDefined();
    expect(driver.tenantId).toBe(tenantId);
    expect(driver.personId).toBe(personId);
    expect(driver.licenseNumber).toBe('12345678900');
    expect(driver.licenseCategory).toBe('AD');
    expect(driver.status).toBe('ACTIVE');
    expect(driver.isLicenseExpired()).toBe(false);
  });

  it('throws on invalid license category', () => {
    expect(() => {
      Driver.create({
        tenantId,
        personId,
        licenseNumber: '12345678900',
        licenseCategory: 'INVALID' as unknown as DriverLicenseCategory,
        licenseExpiresAt: futureExpiry,
      });
    }).toThrow(DriverDomainError);
  });

  it('suspends and reactivates a driver with audit reason', () => {
    const driver = Driver.create({
      tenantId,
      personId,
      licenseNumber: '99988877700',
      licenseCategory: 'D',
      licenseExpiresAt: futureExpiry,
    });

    driver.suspend('Suspensão administrativa por pontos na carteira');
    expect(driver.status).toBe('SUSPENDED');
    expect(driver.suspensionReason).toBe('Suspensão administrativa por pontos na carteira');

    expect(() => {
      driver.suspend('');
    }).toThrow(DriverDomainError);

    driver.reactivate();
    expect(driver.status).toBe('ACTIVE');
    expect(driver.suspensionReason).toBeUndefined();
  });

  it('attaches and updates driver documents', () => {
    const driver = Driver.create({
      tenantId,
      personId,
      licenseNumber: '11122233344',
      licenseCategory: 'E',
      licenseExpiresAt: futureExpiry,
    });

    const doc = DriverDocument.create({
      tenantId,
      driverId: driver.id,
      documentType: 'TOXICOLOGICAL',
      documentNumber: 'TOX-9988',
      expiresAt: futureExpiry,
    });

    expect(doc.status).toBe('VALID');
    driver.attachDocument(doc);
    expect(driver.driverDocuments).toHaveLength(1);

    expect(() => {
      const foreignDoc = DriverDocument.create({
        tenantId,
        driverId: 'other-driver-id',
        documentType: 'CRIMINAL_RECORD',
        documentNumber: 'CR-123',
      });
      driver.attachDocument(foreignDoc);
    }).toThrow(DriverDomainError);
  });
});
