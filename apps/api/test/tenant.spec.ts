import { Tenant, TenantDomainError } from '../src/modules/platform/domain/tenant.entity';

describe('Tenant Domain Entity', () => {
  it('creates a tenant in PROVISIONED status with valid props', () => {
    const tenant = Tenant.create({
      slug: 'transport-alpha',
      legalName: 'Transportes Alpha Ltda',
      commercialName: 'Alpha Express',
    });

    expect(tenant.id).toBeDefined();
    expect(tenant.slug).toBe('transport-alpha');
    expect(tenant.legalName).toBe('Transportes Alpha Ltda');
    expect(tenant.commercialName).toBe('Alpha Express');
    expect(tenant.status).toBe('PROVISIONED');
    expect(tenant.defaultTimezone).toBe('America/Sao_Paulo');
    expect(tenant.version).toBe(1);
    expect(tenant.canPerformOperations()).toBe(false);
  });

  it('rejects invalid slug format', () => {
    expect(() =>
      Tenant.create({
        slug: 'Invalid Slug!',
        legalName: 'Alpha',
      }),
    ).toThrow(TenantDomainError);
  });

  it('rejects empty legal name', () => {
    expect(() =>
      Tenant.create({
        slug: 'alpha',
        legalName: '   ',
      }),
    ).toThrow(TenantDomainError);
  });

  it('activates a PROVISIONED tenant and allows operations', () => {
    const tenant = Tenant.create({
      slug: 'alpha',
      legalName: 'Alpha Ltda',
    });

    tenant.activate();

    expect(tenant.status).toBe('ACTIVE');
    expect(tenant.version).toBe(2);
    expect(tenant.canPerformOperations()).toBe(true);

    // Ativação idempotente
    tenant.activate();
    expect(tenant.status).toBe('ACTIVE');
    expect(tenant.version).toBe(2);
  });

  it('suspends an ACTIVE tenant with reason and blocks operations', () => {
    const tenant = Tenant.create({
      slug: 'alpha',
      legalName: 'Alpha Ltda',
    });
    tenant.activate();

    tenant.suspend('Inadimplência financeira');

    expect(tenant.status).toBe('SUSPENDED');
    expect(tenant.version).toBe(3);
    expect(tenant.canPerformOperations()).toBe(false);

    // Suspensão idempotente
    tenant.suspend('Outro motivo');
    expect(tenant.status).toBe('SUSPENDED');
    expect(tenant.version).toBe(3);
  });

  it('reactivates a SUSPENDED tenant', () => {
    const tenant = Tenant.create({
      slug: 'alpha',
      legalName: 'Alpha Ltda',
    });
    tenant.activate();
    tenant.suspend('Manutenção');

    tenant.activate();

    expect(tenant.status).toBe('ACTIVE');
    expect(tenant.version).toBe(4);
    expect(tenant.canPerformOperations()).toBe(true);
  });

  it('rejects suspension of a PROVISIONED tenant', () => {
    const tenant = Tenant.create({
      slug: 'alpha',
      legalName: 'Alpha Ltda',
    });

    expect(() => tenant.suspend('Tentativa inválida')).toThrow(TenantDomainError);
  });

  it('terminates a tenant and prohibits further transitions', () => {
    const tenant = Tenant.create({
      slug: 'alpha',
      legalName: 'Alpha Ltda',
    });
    tenant.activate();

    tenant.terminate('Encerramento contratual definitivo');

    expect(tenant.status).toBe('TERMINATED');
    expect(tenant.canPerformOperations()).toBe(false);

    expect(() => tenant.activate()).toThrow(TenantDomainError);
    expect(() => tenant.suspend('teste')).toThrow(TenantDomainError);
    expect(() => tenant.updateInfo({ legalName: 'Novo Nome' })).toThrow(TenantDomainError);
  });

  it('updates info and increments version', () => {
    const tenant = Tenant.create({
      slug: 'alpha',
      legalName: 'Alpha Ltda',
    });

    tenant.updateInfo({
      commercialName: 'Novo Nome Fantasia',
      defaultTimezone: 'America/Manaus',
    });

    expect(tenant.commercialName).toBe('Novo Nome Fantasia');
    expect(tenant.defaultTimezone).toBe('America/Manaus');
    expect(tenant.version).toBe(2);
  });
});

