import { Test } from '@nestjs/testing';
import { POSTGRES_POOL } from '../src/common/database/database.module';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import {
  ClientCompany,
  ClientCompanyDomainError,
  normalizeTaxId,
  validateCnpj,
} from '../src/modules/clients/domain/client-company.entity';
import {
  CLIENT_COMPANY_REPOSITORY_TOKEN,
} from '../src/modules/clients/domain/client-company.repository';
import {
  ClientCompanyManagementService,
  ClientCompanyTaxIdConflictError,
} from '../src/modules/clients/application/client-company-management.service';

describe('ClientCompany Aggregate & Domain Rules', () => {
  // CNPJ válido para testes (gerado conforme algoritmo oficial da RFB)
  const validCnpj = '11.222.333/0001-81';
  const validCnpjDigits = '11222333000181';

  it('normalizes taxId removing punctuation', () => {
    expect(normalizeTaxId('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeTaxId('11222333000181')).toBe('11222333000181');
  });

  it('validates CNPJ checksum correctly', () => {
    expect(validateCnpj(validCnpj)).toBe(true);
    expect(validateCnpj(validCnpjDigits)).toBe(true);
    // Dígito verificador incorreto
    expect(validateCnpj('11222333000180')).toBe(false);
    // Sequência repetida
    expect(validateCnpj('11111111111111')).toBe(false);
    // Tamanho incompatível
    expect(validateCnpj('123456')).toBe(false);
  });

  it('creates an active ClientCompany with valid attributes', () => {
    const company = ClientCompany.create({
      tenantId: '11111111-1111-1111-1111-111111111111',
      legalName: 'Acme Corporação Ltda',
      commercialName: 'Acme Corp',
      taxId: validCnpj,
      billingAddress: {
        street: 'Av Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01310-100',
      },
      contacts: [
        {
          name: 'João Silva',
          email: 'joao@acme.com',
          role: 'Diretor Operacional',
          isPrimary: true,
        },
      ],
    });

    expect(company.id).toBeDefined();
    expect(company.tenantId).toBe('11111111-1111-1111-1111-111111111111');
    expect(company.legalName).toBe('Acme Corporação Ltda');
    expect(company.commercialName).toBe('Acme Corp');
    expect(company.taxId).toBe(validCnpjDigits);
    expect(company.status).toBe('ACTIVE');
    expect(company.timezone).toBe('America/Sao_Paulo');
    expect(company.version).toBe(1);
    expect(company.billingAddress.street).toBe('Av Paulista');
    expect(company.contacts).toHaveLength(1);
    expect(company.contacts[0].isPrimary).toBe(true);
  });

  it('throws when mandatory fields are missing or invalid', () => {
    expect(() =>
      ClientCompany.create({
        tenantId: '',
        legalName: 'Empresa',
        commercialName: 'Empresa',
        taxId: validCnpj,
      }),
    ).toThrow(ClientCompanyDomainError);

    expect(() =>
      ClientCompany.create({
        tenantId: '11111111-1111-1111-1111-111111111111',
        legalName: '',
        commercialName: 'Empresa',
        taxId: validCnpj,
      }),
    ).toThrow(ClientCompanyDomainError);

    expect(() =>
      ClientCompany.create({
        tenantId: '11111111-1111-1111-1111-111111111111',
        legalName: 'Empresa',
        commercialName: '',
        taxId: validCnpj,
      }),
    ).toThrow(ClientCompanyDomainError);

    expect(() =>
      ClientCompany.create({
        tenantId: '11111111-1111-1111-1111-111111111111',
        legalName: 'Empresa',
        commercialName: 'Empresa',
        taxId: '00000000000000',
      }),
    ).toThrow(ClientCompanyDomainError);
  });

  it('handles state transitions: ACTIVE -> INACTIVE -> ACTIVE and ACTIVE -> BLOCKED', () => {
    const company = ClientCompany.create({
      tenantId: '11111111-1111-1111-1111-111111111111',
      legalName: 'Acme Corporação Ltda',
      commercialName: 'Acme Corp',
      taxId: validCnpj,
    });

    expect(company.status).toBe('ACTIVE');

    company.inactivate();
    expect(company.status).toBe('INACTIVE');

    company.activate();
    expect(company.status).toBe('ACTIVE');

    expect(() => company.block('')).toThrow('Reason is required');
    company.block('Inadimplência contratual severa');
    expect(company.status).toBe('BLOCKED');

    // Não deve permitir atualizar dados cadastrais enquanto bloqueada
    expect(() =>
      company.update({
        commercialName: 'Novo Nome Fantasia',
      }),
    ).toThrow('Cannot update a blocked client company');

    // Desbloqueia reativando
    company.activate();
    expect(company.status).toBe('ACTIVE');
    company.update({ commercialName: 'Novo Nome Fantasia' });
    expect(company.commercialName).toBe('Novo Nome Fantasia');
  });

  it('reconstitutes from raw persisted props correctly', () => {
    const now = new Date();
    const company = ClientCompany.reconstitute({
      id: '22222222-2222-2222-2222-222222222222',
      tenantId: '11111111-1111-1111-1111-111111111111',
      legalName: 'Empresa Reconstituída S/A',
      commercialName: 'Empresa Reconstituída',
      taxId: validCnpjDigits,
      status: 'BLOCKED',
      timezone: 'America/Manaus',
      billingAddress: {
        street: 'Rua das Flores',
        number: '123',
        neighborhood: 'Centro',
        city: 'Manaus',
        state: 'AM',
        postalCode: '69000-000',
      },
      billingContactData: { financialEmail: 'financeiro@reconstituida.com' },
      contacts: [],
      version: 4,
      createdAt: now,
      updatedAt: now,
    });

    expect(company.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(company.status).toBe('BLOCKED');
    expect(company.timezone).toBe('America/Manaus');
    expect(company.version).toBe(4);
    expect(company.billingContactData).toEqual({
      financialEmail: 'financeiro@reconstituida.com',
    });
  });
});

describe('ClientCompanyManagementService Orchestration', () => {
  const validCnpj = '11.222.333/0001-81';
  const tenantId = '11111111-1111-1111-1111-111111111111';

  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { connect: jest.Mock };
  let mockRepository: {
    findById: jest.Mock;
    findByTaxId: jest.Mock;
    save: jest.Mock;
    list: jest.Mock;
  };
  let mockOutboxRepository: { append: jest.Mock };
  let service: ClientCompanyManagementService;

  beforeEach(async () => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    mockRepository = {
      findById: jest.fn(),
      findByTaxId: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(),
    };
    mockOutboxRepository = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientCompanyManagementService,
        { provide: POSTGRES_POOL, useValue: mockPool },
        { provide: CLIENT_COMPANY_REPOSITORY_TOKEN, useValue: mockRepository },
        { provide: PostgresOutboxRepository, useValue: mockOutboxRepository },
      ],
    }).compile();

    service = moduleRef.get(ClientCompanyManagementService);
  });

  it('creates client company, records outbox event and audit log', async () => {
    mockRepository.findByTaxId.mockResolvedValue(null);

    const result = await service.create(
      tenantId,
      {
        legalName: 'Viação Exemplo S/A',
        commercialName: 'Viação Exemplo',
        taxId: validCnpj,
      },
      'user-123',
    );

    expect(result.id).toBeDefined();
    expect(result.legalName).toBe('Viação Exemplo S/A');
    expect(result.taxId).toBe('11222333000181');
    expect(result.status).toBe('ACTIVE');

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepository.append).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        tenantId,
        eventType: 'ClientCompanyCreated',
        aggregateType: 'ClientCompany',
      }),
    );
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('throws conflict error if taxId already exists in tenant', async () => {
    mockRepository.findByTaxId.mockResolvedValue(
      ClientCompany.create({
        tenantId,
        legalName: 'Outra Empresa',
        commercialName: 'Outra',
        taxId: validCnpj,
      }),
    );

    await expect(
      service.create(tenantId, {
        legalName: 'Empresa Duplicada',
        commercialName: 'Duplicada',
        taxId: validCnpj,
      }),
    ).rejects.toThrow(ClientCompanyTaxIdConflictError);

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockOutboxRepository.append).not.toHaveBeenCalled();
  });

  it('updates company and records outbox event and audit log', async () => {
    const existing = ClientCompany.create({
      tenantId,
      legalName: 'Nome Antigo',
      commercialName: 'Fantasia Antiga',
      taxId: validCnpj,
    });
    mockRepository.findById.mockResolvedValue(existing);

    const result = await service.update(tenantId, existing.id, {
      legalName: 'Nome Novo',
      commercialName: 'Fantasia Nova',
    });

    expect(result.legalName).toBe('Nome Novo');
    expect(result.commercialName).toBe('Fantasia Nova');
    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepository.append).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        eventType: 'ClientCompanyUpdated',
      }),
    );
  });

  it('changes status to BLOCKED and records reason', async () => {
    const existing = ClientCompany.create({
      tenantId,
      legalName: 'Empresa Ativa',
      commercialName: 'Ativa',
      taxId: validCnpj,
    });
    mockRepository.findById.mockResolvedValue(existing);

    const result = await service.changeStatus(tenantId, existing.id, {
      status: 'BLOCKED',
      reason: 'Falta de pagamento persistente',
    });

    expect(result.status).toBe('BLOCKED');
    expect(mockOutboxRepository.append).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        eventType: 'ClientCompanyStatusChanged',
        payload: expect.objectContaining({
          previousStatus: 'ACTIVE',
          newStatus: 'BLOCKED',
          reason: 'Falta de pagamento persistente',
        }),
      }),
    );
  });
});