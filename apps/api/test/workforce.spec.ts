import { Test } from '@nestjs/testing';
import { POSTGRES_POOL } from '../src/common/database/database.module';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import {
  Person,
  PersonDomainError,
  normalizeCpf,
  validateCpf,
} from '../src/modules/workforce/domain/person.entity';
import {
  Employee,
} from '../src/modules/workforce/domain/employee.entity';
import {
  CompanyEmployment,
  CompanyEmploymentDomainError,
} from '../src/modules/workforce/domain/company-employment.entity';
import {
  ProvisionalTransportAuthorization,
  ProvisionalAuthorizationDomainError,
} from '../src/modules/workforce/domain/provisional-transport-authorization.entity';
import {
  WORKFORCE_REPOSITORY_TOKEN,
} from '../src/modules/workforce/domain/workforce.repository';
import {
  WorkforceManagementService,
  PersonDocumentConflictError,
} from '../src/modules/workforce/application/workforce-management.service';

describe('Workforce Domain Aggregates & Rules', () => {
  // CPF válido gerado conforme algoritmo oficial da RFB
  const validCpf = '529.982.247-25';
  const validCpfDigits = '52998224725';
  const tenantId = '11111111-1111-1111-1111-111111111111';

  describe('Person Entity & CPF Validation', () => {
    it('normalizes CPF removing punctuation', () => {
      expect(normalizeCpf(validCpf)).toBe(validCpfDigits);
      expect(normalizeCpf('52998224725')).toBe(validCpfDigits);
    });

    it('validates CPF checksum correctly', () => {
      expect(validateCpf(validCpf)).toBe(true);
      expect(validateCpf(validCpfDigits)).toBe(true);
      // Dígito verificador incorreto
      expect(validateCpf('52998224720')).toBe(false);
      // Sequência repetida
      expect(validateCpf('11111111111')).toBe(false);
      // Comprimento incorreto
      expect(validateCpf('123456')).toBe(false);
    });

    it('creates an active Person with valid data', () => {
      const person = Person.create({
        tenantId,
        fullName: 'Maria da Silva',
        preferredName: 'Mari',
        documentRef: validCpf,
        email: 'MARIA@EXEMPLO.COM',
        phone: '11988887777',
      });

      expect(person.id).toBeDefined();
      expect(person.tenantId).toBe(tenantId);
      expect(person.fullName).toBe('Maria da Silva');
      expect(person.preferredName).toBe('Mari');
      expect(person.documentRef).toBe(validCpfDigits);
      expect(person.email).toBe('maria@exemplo.com');
      expect(person.status).toBe('ACTIVE');
      expect(person.version).toBe(1);
    });

    it('throws when mandatory person fields are missing or invalid', () => {
      expect(() =>
        Person.create({
          tenantId: '',
          fullName: 'Teste',
          documentRef: validCpf,
        }),
      ).toThrow(PersonDomainError);

      expect(() =>
        Person.create({
          tenantId,
          fullName: '',
          documentRef: validCpf,
        }),
      ).toThrow(PersonDomainError);

      expect(() =>
        Person.create({
          tenantId,
          fullName: 'Teste',
          documentRef: '00000000000',
        }),
      ).toThrow(PersonDomainError);
    });

    it('updates person data and toggles status', () => {
      const person = Person.create({
        tenantId,
        fullName: 'Maria Silva',
        documentRef: validCpf,
      });

      person.update({ fullName: 'Maria Silva Sauro', phone: '11999990000' });
      expect(person.fullName).toBe('Maria Silva Sauro');
      expect(person.phone).toBe('11999990000');

      person.inactivate();
      expect(person.status).toBe('INACTIVE');
      expect(() => person.update({ fullName: 'Novo Nome' })).toThrow('Cannot update an inactive person');

      person.activate();
      expect(person.status).toBe('ACTIVE');
    });
  });

  describe('Employee Aggregate', () => {
    it('creates an active employee with UNLINKED platform account', () => {
      const employee = Employee.create({
        tenantId,
        personId: '22222222-2222-2222-2222-222222222222',
      });

      expect(employee.id).toBeDefined();
      expect(employee.status).toBe('ACTIVE');
      expect(employee.platformAccountStatus).toBe('UNLINKED');
      expect(employee.version).toBe(1);

      employee.linkPlatformAccount();
      expect(employee.platformAccountStatus).toBe('LINKED');

      employee.unlinkPlatformAccount();
      expect(employee.platformAccountStatus).toBe('UNLINKED');
    });

    it('handles employee status transitions including suspension', () => {
      const employee = Employee.create({
        tenantId,
        personId: '22222222-2222-2222-2222-222222222222',
      });

      expect(() => employee.suspend('')).toThrow('Reason is required');

      employee.suspend('Infração operacional em rota');
      expect(employee.status).toBe('SUSPENDED');

      employee.activate();
      expect(employee.status).toBe('ACTIVE');
    });
  });

  describe('CompanyEmployment Entity', () => {
    const employeeId = '22222222-2222-2222-2222-222222222222';
    const clientCompanyId = '33333333-3333-3333-3333-333333333333';

    it('creates active company employment with temporal validity', () => {
      const from = new Date('2026-01-01T00:00:00Z');
      const to = new Date('2026-12-31T23:59:59Z');

      const employment = CompanyEmployment.create({
        tenantId,
        employeeId,
        clientCompanyId,
        externalEmployeeCode: 'MAT-9988',
        validFrom: from,
        validTo: to,
      });

      expect(employment.id).toBeDefined();
      expect(employment.externalEmployeeCode).toBe('MAT-9988');
      expect(employment.status).toBe('ACTIVE');
      expect(employment.isActiveAt(new Date('2026-06-15T00:00:00Z'))).toBe(true);
      expect(employment.isActiveAt(new Date('2025-12-31T00:00:00Z'))).toBe(false);
      expect(employment.isActiveAt(new Date('2027-01-01T00:00:00Z'))).toBe(false);

      employment.terminate(new Date('2026-06-01T00:00:00Z'));
      expect(employment.status).toBe('TERMINATED');
      expect(employment.isActiveAt(new Date('2026-05-01T00:00:00Z'))).toBe(false);
    });

    it('rejects invalid temporal intervals', () => {
      expect(() =>
        CompanyEmployment.create({
          tenantId,
          employeeId,
          clientCompanyId,
          validFrom: new Date('2026-12-31T00:00:00Z'),
          validTo: new Date('2026-01-01T00:00:00Z'),
        }),
      ).toThrow(CompanyEmploymentDomainError);
    });
  });

  describe('ProvisionalTransportAuthorization Entity', () => {
    const employeeId = '22222222-2222-2222-2222-222222222222';
    const clientCompanyId = '33333333-3333-3333-3333-333333333333';

    it('creates active provisional authorization and checks temporal validity', () => {
      const from = new Date('2026-11-01T00:00:00Z');
      const to = new Date('2026-11-30T23:59:59Z');

      const auth = ProvisionalTransportAuthorization.create({
        tenantId,
        employeeId,
        clientCompanyId,
        validFrom: from,
        validTo: to,
        approvedBy: '44444444-4444-4444-4444-444444444444',
        completedReason: 'Período de integração e treinamento',
      });

      expect(auth.id).toBeDefined();
      expect(auth.status).toBe('ACTIVE');
      expect(auth.isValidAt(new Date('2026-11-15T00:00:00Z'))).toBe(true);
      expect(auth.isValidAt(new Date('2026-12-01T00:00:00Z'))).toBe(false);

      expect(() => auth.revoke('')).toThrow('Reason is required');
      auth.revoke('Treinamento finalizado antecipadamente');
      expect(auth.status).toBe('REVOKED');
      expect(auth.isValidAt(new Date('2026-11-15T00:00:00Z'))).toBe(false);
    });

    it('rejects invalid authorization intervals', () => {
      expect(() =>
        ProvisionalTransportAuthorization.create({
          tenantId,
          employeeId,
          clientCompanyId,
          validFrom: new Date('2026-11-30T00:00:00Z'),
          validTo: new Date('2026-11-01T00:00:00Z'),
        }),
      ).toThrow(ProvisionalAuthorizationDomainError);
    });
  });
});

describe('WorkforceManagementService Orchestration', () => {
  const validCpf = '529.982.247-25';
  const tenantId = '11111111-1111-1111-1111-111111111111';

  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { connect: jest.Mock };
  let mockRepository: {
    savePerson: jest.Mock;
    findPersonById: jest.Mock;
    findPersonByDocument: jest.Mock;
    listPeople: jest.Mock;
    saveEmployee: jest.Mock;
    findEmployeeById: jest.Mock;
    findEmployeeByPersonId: jest.Mock;
    listEmployees: jest.Mock;
    saveEmployment: jest.Mock;
    findEmploymentById: jest.Mock;
    listEmploymentsByCompany: jest.Mock;
    listEmploymentsByEmployee: jest.Mock;
    saveProvisionalAuthorization: jest.Mock;
    findProvisionalAuthorizationById: jest.Mock;
    listProvisionalAuthorizations: jest.Mock;
  };
  let mockOutboxRepository: { append: jest.Mock };
  let service: WorkforceManagementService;

  beforeEach(async () => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    mockRepository = {
      savePerson: jest.fn().mockResolvedValue(undefined),
      findPersonById: jest.fn(),
      findPersonByDocument: jest.fn(),
      listPeople: jest.fn(),
      saveEmployee: jest.fn().mockResolvedValue(undefined),
      findEmployeeById: jest.fn(),
      findEmployeeByPersonId: jest.fn(),
      listEmployees: jest.fn(),
      saveEmployment: jest.fn().mockResolvedValue(undefined),
      findEmploymentById: jest.fn(),
      listEmploymentsByCompany: jest.fn(),
      listEmploymentsByEmployee: jest.fn(),
      saveProvisionalAuthorization: jest.fn().mockResolvedValue(undefined),
      findProvisionalAuthorizationById: jest.fn(),
      listProvisionalAuthorizations: jest.fn(),
    };
    mockOutboxRepository = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkforceManagementService,
        { provide: POSTGRES_POOL, useValue: mockPool },
        { provide: WORKFORCE_REPOSITORY_TOKEN, useValue: mockRepository },
        { provide: PostgresOutboxRepository, useValue: mockOutboxRepository },
      ],
    }).compile();

    service = moduleRef.get(WorkforceManagementService);
  });

  it('creates person and records outbox event', async () => {
    mockRepository.findPersonByDocument.mockResolvedValue(null);

    const result = await service.createPerson(
      tenantId,
      {
        fullName: 'Carlos Alberto',
        documentRef: validCpf,
        email: 'carlos@empresa.com',
      },
      'admin-user',
    );

    expect(result.id).toBeDefined();
    expect(result.fullName).toBe('Carlos Alberto');
    expect(result.documentRef).toBe('52998224725');
    expect(result.status).toBe('ACTIVE');

    expect(mockRepository.savePerson).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepository.append).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        tenantId,
        eventType: 'PersonCreated',
        aggregateType: 'Person',
      }),
    );
  });

  it('throws conflict if person document already exists', async () => {
    mockRepository.findPersonByDocument.mockResolvedValue(
      Person.create({
        tenantId,
        fullName: 'Outra Pessoa',
        documentRef: validCpf,
      }),
    );

    await expect(
      service.createPerson(tenantId, {
        fullName: 'Pessoa Duplicada',
        documentRef: validCpf,
      }),
    ).rejects.toThrow(PersonDocumentConflictError);
  });

  it('creates employee for existing person and records outbox event', async () => {
    const person = Person.create({
      tenantId,
      fullName: 'Carlos Alberto',
      documentRef: validCpf,
    });
    mockRepository.findPersonById.mockResolvedValue(person);
    mockRepository.findEmployeeByPersonId.mockResolvedValue(null);

    const result = await service.createEmployee(tenantId, {
      personId: person.id,
    });

    expect(result.id).toBeDefined();
    expect(result.personId).toBe(person.id);
    expect(result.status).toBe('ACTIVE');
    expect(mockRepository.saveEmployee).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepository.append).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        eventType: 'EmployeeCreated',
      }),
    );
  });

  it('creates company employment linking employee to client company', async () => {
    const employee = Employee.create({
      tenantId,
      personId: '22222222-2222-2222-2222-222222222222',
    });
    mockRepository.findEmployeeById.mockResolvedValue(employee);

    const result = await service.createEmployment(tenantId, {
      employeeId: employee.id,
      clientCompanyId: '33333333-3333-3333-3333-333333333333',
      externalEmployeeCode: 'EMP-1234',
    });

    expect(result.id).toBeDefined();
    expect(result.employeeId).toBe(employee.id);
    expect(result.clientCompanyId).toBe('33333333-3333-3333-3333-333333333333');
    expect(result.externalEmployeeCode).toBe('EMP-1234');
    expect(mockRepository.saveEmployment).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepository.append).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        eventType: 'CompanyEmploymentCreated',
      }),
    );
  });

  it('creates and revokes provisional transport authorization', async () => {
    const employee = Employee.create({
      tenantId,
      personId: '22222222-2222-2222-2222-222222222222',
    });
    mockRepository.findEmployeeById.mockResolvedValue(employee);

    const result = await service.createProvisionalAuthorization(tenantId, {
      employeeId: employee.id,
      clientCompanyId: '33333333-3333-3333-3333-333333333333',
      validFrom: '2026-11-01T00:00:00Z',
      validTo: '2026-11-30T23:59:59Z',
      completedReason: 'Integração temporária',
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('ACTIVE');

    const auth = ProvisionalTransportAuthorization.create({
      id: result.id,
      tenantId,
      employeeId: employee.id,
      clientCompanyId: '33333333-3333-3333-3333-333333333333',
      validFrom: new Date('2026-11-01T00:00:00Z'),
      validTo: new Date('2026-11-30T23:59:59Z'),
    });
    mockRepository.findProvisionalAuthorizationById.mockResolvedValue(auth);

    const revoked = await service.revokeProvisionalAuthorization(
      tenantId,
      result.id,
      'Finalizado com sucesso',
    );
    expect(revoked.status).toBe('REVOKED');
    expect(mockOutboxRepository.append).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        eventType: 'ProvisionalAuthorizationRevoked',
      }),
    );
  });
});
