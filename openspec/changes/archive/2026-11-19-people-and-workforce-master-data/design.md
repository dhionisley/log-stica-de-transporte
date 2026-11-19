# Design

## Context

Com a entrega do incremento M2.1 (`client-companies-master-data`), a plataforma agora possui a estrutura corporativa de empresas clientes contratantes (`crm.client_companies`).
O passo seguinte para o Milestone M2 é materializar o quadro de pessoas e colaboradores corporativos, conforme especificado na Seção 10 de `data-model-plataforma-transporte.md` e nos épicos de domínio F04 e F05 de `features-plataforma-transporte.md`.

## Goals / Non-Goals

**Goals:**
- Criar o schema `workforce` e as tabelas `workforce.people`, `workforce.employees`, `workforce.company_employments` e `workforce.provisional_transport_authorizations` com RLS obrigatório via variável `app.tenant_id`.
- Modelar o agregado `Person` com validação de CPF (dígitos verificadores da Receita Federal) e unicidade por tenant via `UNIQUE (tenant_id, document_ref)`.
- Modelar o agregado `Employee` associado a `Person`, com controle de estado de conta de plataforma (`LINKED`/`UNLINKED`) e ciclo de vida (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
- Modelar os vínculos empregatícios temporais (`CompanyEmployment`) vinculados às empresas clientes (`crm.client_companies`), garantindo que um colaborador possa ter vínculos simultâneos com diferentes empresas sem vazamento de privacidade entre elas.
- Modelar autorizações provisórias de passageiro (`ProvisionalTransportAuthorization`) com vigência explícita, aprovador e motivo.
- Implementar repositórios PostgreSQL transacionais com controle de concorrência otimista via coluna `version`.
- Orquestrar operações de aplicação emitindo eventos de integração no Transactional Outbox e gravações imutáveis na tabela `audit.audit_records`.
- Expor API REST com endpoints protegidos por autenticação e validação estrita via Zod.

**Non-Goals:**
- Cadastro de motoristas (`workforce.drivers`), veículos e elegibilidade de frota (escopo de M2.3).
- Agendamento de viagens ou detecção de conflitos de trânsito (escopo de M3/M4).

## Decisions

### 1. Separação Arquitetural entre `Person` e `Employee`
- **Decisão**: `Person` representa o indivíduo humano canônico (identificação fiscal CPF, nome, contato). `Employee` representa a qualificação do indivíduo como colaborador operacional dentro do tenant.
- **Racional**: Permite que uma mesma pessoa física possa ter múltiplos papéis na plataforma (por exemplo, colaborador e motorista no incremento M2.3) sem duplicação de dados pessoais e respeitando o modelo de domínio definido na arquitetura.

### 2. Vínculos Empregatícios Multi-Company Temporais (`CompanyEmployment`)
- **Decisão**: `CompanyEmployment` é uma entidade modelada com `valid_from` e `valid_to` (opcional), associando `employee_id` e `client_company_id`.
- **Racional**: Na logística de transporte de passageiros, colaboradores frequentemente prestam serviços para mais de uma empresa contratante ou mudam de cliente mantendo histórico cadastral. O isolamento de visualização é garantido em nível de aplicação e repositório, onde consultas originadas de uma empresa cliente filtram explicitamente por seu respectivo `client_company_id`.

### 3. Integridade Referencial Composta Tenant-Aware
- **Decisão**: Todas as chaves estrangeiras que cruzam tabelas tenant-scoped utilizam chaves compostas `(tenant_id, parent_id)`.
- **Racional**: Impede fisicamente que um colaborador do Tenant A seja associado a uma empresa cliente do Tenant B em nível de banco de dados.

### 4. Concorrência Otimista com Coluna `version`
- **Decisão**: Cada tabela possui uma coluna `version bigint NOT NULL DEFAULT 1`, e updates exigem que a versão em banco corresponda à versão em memória, incrementando-a atomicamente (`version = version + 1`).

### 5. Estrutura Hexagonal do Módulo `workforce`
- `apps/api/src/modules/workforce/`:
  - `domain/`: entidades `Person`, `Employee`, `CompanyEmployment`, `ProvisionalTransportAuthorization`, eventos e repositórios interfaces.
  - `infrastructure/`: `PostgresWorkforceRepository` implementando persistência transacional com `PoolClient`.
  - `application/`: `WorkforceManagementService` orquestrando transações, outbox e auditoria.
  - `controllers/`: `WorkforceController` com schemas Zod.

## Risks / Trade-offs

- **[Risco] Vazamento de dados de múltiplos vínculos entre empresas clientes concorrentes**:
  → *Mitigação*: Endpoints de listagem e consulta exigem parâmetro ou escopo de `clientCompanyId` e são testados em suíte de integração para verificar que a Empresa A não visualiza os vínculos da Empresa B.
- **[Risco] Concorrência em atualizações de dados de colaboradores**:
  → *Mitigação*: Checagem estrita de versão otimista com lançamento de `WorkforceDomainError` em conflitos de concorrência.

## Migration Plan

1. Criar migration `infrastructure/migrations/0007_workforce_people_and_employment.sql` com:
   - `CREATE SCHEMA IF NOT EXISTS workforce;`
   - Tabelas `workforce.people`, `workforce.employees`, `workforce.company_employments`, `workforce.provisional_transport_authorizations`.
   - RLS ativado e forçado em todas as tabelas.
   - Chaves compostas e constraints de unicidade.
   - Índices de performance temporais e relacionais.
   - Permissões em `iam.permissions`: `workforce:read`, `workforce:write`, `workforce:admin`.
2. Execução via `migration-runner` idempotente.
