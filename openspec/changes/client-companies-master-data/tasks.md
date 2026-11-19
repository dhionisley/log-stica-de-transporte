# Tasks

## 1. Banco de Dados e Migração

- [ ] 1.1 Criar migration `infrastructure/migrations/0006_crm_client_companies.sql` com schema `crm`, tabela `crm.client_companies`, constraint `UNIQUE (tenant_id, tax_id)`, RLS e índices de performance.
- [ ] 1.2 Atualizar teste de integração do runner de migração em `apps/api/test/migration-runner.integration-spec.ts` para cobrir a migration 0006.
- [x] 1.1 Criar migration `infrastructure/migrations/0006_crm_client_companies.sql` com schema `crm`, tabela `crm.client_companies`, constraint `UNIQUE (tenant_id, tax_id)`, RLS e índices de performance.
- [x] 1.2 Atualizar teste de integração do runner de migração em `apps/api/test/migration-runner.integration-spec.ts` para cobrir a migration 0006.

## 2. Camada de Domínio

- [ ] 2.1 Modelar agregado `ClientCompany`, invariantes de ciclo de vida (`ACTIVE`, `INACTIVE`, `BLOCKED`), Value Objects para `billing_address` e `contacts`, e eventos de domínio.
- [ ] 2.2 Definir a interface de persistência `IClientCompanyRepository` e implementar os testes unitários de domínio em `apps/api/test/client-companies.spec.ts`.
- [x] 2.1 Modelar agregado `ClientCompany`, invariantes de ciclo de vida (`ACTIVE`, `INACTIVE`, `BLOCKED`), Value Objects para `billing_address` e `contacts`, e eventos de domínio.
- [x] 2.2 Definir a interface de persistência `IClientCompanyRepository` e implementar os testes unitários de domínio em `apps/api/test/client-companies.spec.ts`.

## 3. Camada de Infraestrutura

- [ ] 3.1 Implementar `PostgresClientCompanyRepository` executando queries parametrizadas com `PoolClient` e suporte a concorrência otimista via coluna `version`.
- [x] 3.1 Implementar `PostgresClientCompanyRepository` executando queries parametrizadas com `PoolClient` e suporte a concorrência otimista via coluna `version`.

## 4. Camada de Aplicação

- [ ] 4.1 Implementar `ClientCompanyManagementService` integrando `TenantTransactionHelper`, gravação no `TransactionalOutboxRepository` e auditoria imutável em `AuditLogRepository`.
- [ ] 4.2 Enriquecer suíte unitária `client-companies.spec.ts` validando orquestração, regras de unicidade de CNPJ e transições de status.
- [x] 4.1 Implementar `ClientCompanyManagementService` integrando `TenantTransactionHelper`, gravação no `TransactionalOutboxRepository` e auditoria imutável em `AuditLogRepository`.
- [x] 4.2 Enriquecer suíte unitária `client-companies.spec.ts` validando orquestração, regras de unicidade de CNPJ e transições de status.

## 5. Exposição REST e Módulo NestJS

- [ ] 5.1 Criar `ClientCompanyController` com validação de esquema Zod para criação, atualização e transição de status, protegido por `JwtAuthGuard`.
- [ ] 5.2 Criar `ClientsModule` encapsulando repositórios e serviços, e registrar o módulo em `apps/api/src/app.module.ts`.
- [x] 5.1 Criar `ClientCompanyController` com validação de esquema Zod para criação, atualização e transição de status, protegido por `JwtAuthGuard`.
- [x] 5.2 Criar `ClientsModule` encapsulando repositórios e serviços, e registrar o módulo em `apps/api/src/app.module.ts`.

## 6. Verificação e Integração

- [ ] 6.1 Criar suíte de integração PostgreSQL `apps/api/test/client-companies.integration-spec.ts` validando persistência, concorrência e isolamento RLS cross-tenant.
- [ ] 6.2 Executar validação de qualidade local (`pnpm lint:api`, `pnpm build:api`, `pnpm test:api`, `pnpm lint:web`, `pnpm build:web`) e preparar commit da proposta.

## Workflow follow-up

- Arquivar a change via OpenSpec após aprovação e execução bem-sucedida do CI.
- Prosseguir para o Incremento M2.2 (`people-and-workforce-master-data`).

