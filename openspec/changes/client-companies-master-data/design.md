# Design

## Context

O Milestone M1 consolidou o SaaS Control Plane, isolamento de tenants, IAM, RBAC, autenticação com MFA e controle de planos e quotas.
Para iniciar o Milestone M2 (Operational Master Data), é necessário introduzir o cadastro canônico de empresas clientes contratantes (`ClientCompany`), conforme especificado em `data-model-plataforma-transporte.md` (seção 8) e `features-plataforma-transporte.md` (Épico F04).
A plataforma precisa registrar as empresas que contratam serviços de transporte, permitindo posterior associação de passageiros/colaboradores, rotas e faturamento.

## Goals / Non-Goals

**Goals:**
- Criar o schema `crm` e a tabela `crm.client_companies` com RLS obrigatório baseado na variável transacional `app.tenant_id`.
- Garantir a unicidade do documento fiscal (`tax_id`/CNPJ) por tenant via constraint `UNIQUE (tenant_id, tax_id)`.
- Implementar o agregado de domínio `ClientCompany` em `apps/api/src/modules/clients` com invariantes estritas, máquina de estados (`ACTIVE`, `INACTIVE`, `BLOCKED`) e controle de versão otimista.
- Prover repositório PostgreSQL nativo integrado ao `TenantTransactionHelper`.
- Emitir eventos de integração no Transactional Outbox (`ClientCompanyCreated`, `ClientCompanyUpdated`, `ClientCompanyStatusChanged`) e registros em `platform.audit_logs`.
- Expor API REST com endpoints protegidos por `JwtAuthGuard`, guards de permissão e esquemas estritos de validação Zod.

**Non-Goals:**
- Cadastro de vínculos de colaboradores (`CompanyEmployment`) ou passageiros provisórios (pertence ao incremento M2.2).
- Contratos financeiros, SLAs ou precificação (pertence a M3/M7).
- Cadastro de veículos ou motoristas (pertence a M2.3).

## Decisions

### 1. Schema `crm` e tabela `crm.client_companies`
- **Decisão**: Utilizar o schema de banco de dados `crm` e a tabela `crm.client_companies`, conforme padronizado na documentação de arquitetura (`data-model-plataforma-transporte.md`).
- **Alternativas consideradas**: Criar schema `clients` ou unificar em `platform`. Rejeitado pois rompe o particionamento lógico dos schemas aprovados e a separação de responsabilidades entre SaaS Control Plane (`platform`) e CRM/Operacional (`crm`).

### 2. Identificação fiscal e unicidade por tenant
- **Decisão**: Constraint composta `UNIQUE (tenant_id, tax_id)`. O `tax_id` armazena o CNPJ (apenas dígitos).
- **Alternativas consideradas**: Unicidade global de CNPJ em toda a base de dados. Rejeitado porque a arquitetura multitenant prevê que a mesma empresa jurídica contratante pode ser atendida por operadoras de transporte distintas em locatários independentes sem colisão.

### 3. Modelagem de Endereço de Faturamento e Contatos como Value Objects em JSONB
- **Decisão**: Armazenar `billing_address` e `contacts` como colunas JSONB com validação estrita em nível de domínio e esquema Zod.
- **Alternativas consideradas**: Criação de tabelas relacionais filhas `crm.client_addresses` e `crm.client_contacts`. Rejeitado para esta fase de cadastro mestre, pois JSONB oferece alta flexibilidade e integridade suficiente sem sobrecarregar joins operacionais.

### 4. Máquina de Estados e Governança de Ciclo de Vida
- **Decisão**: Estados `ACTIVE`, `INACTIVE` e `BLOCKED`. A transição para `BLOCKED` exige justificativa administrativa e bloqueia a aceitação de novas demandas na aplicação. A exclusão de uma empresa cliente opera por soft-inactivation (`INACTIVE`), preservando o histórico para auditoria e relatórios futuros.

### 5. Arquitetura Hexagonal no Módulo `clients`
- **Decisão**: Organizar `apps/api/src/modules/clients/` em:
  - `domain/`: agregado `ClientCompany`, status, eventos de domínio, interface `IClientCompanyRepository`.
  - `infrastructure/`: `PostgresClientCompanyRepository` sobre `PoolClient`.
  - `application/`: `ClientCompanyManagementService` orquestrando transações, outbox e auditoria.
  - `controllers/`: `ClientCompanyController` com DTOs Zod.

## Risks / Trade-offs

- **[Risco] Atualizações concorrentes de dados cadastrais**: Podem sobrescrever modificações de outros operadores.
  → *Mitigação*: Utilização de concorrência otimista com verificação de coluna `version` em cada update (`UPDATE ... WHERE id = $1 AND tenant_id = $2 AND version = $3`).
- **[Risco] Vazamento de dados de clientes entre tenants**:
  → *Mitigação*: Habilitação de RLS nativo no PostgreSQL com `FORCE ROW LEVEL SECURITY`, validação de `app.tenant_id` e suíte de testes de integração com queries cross-tenant.

## Migration Plan

1. Criar migration `infrastructure/migrations/0006_crm_client_companies.sql` com:
   - `CREATE SCHEMA IF NOT EXISTS crm;`
   - `CREATE TABLE crm.client_companies (...);`
   - Habilitação de RLS e políticas de isolamento.
   - Índices para busca por nome, documento e status.
2. Execução controlada pelo `migration-runner` idempotente.

