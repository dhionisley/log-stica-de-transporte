# Tasks

## 1. Banco de Dados e Migração

- [x] 1.1 Criar migration `infrastructure/migrations/0007_workforce_people_and_employment.sql` com schema `workforce`, tabelas `people`, `employees`, `company_employments`, `provisional_transport_authorizations`, RLS, constraints e índices.
- [x] 1.2 Atualizar teste de integração do runner de migração em `apps/api/test/migration-runner.integration-spec.ts` cobrindo a migration 0007.

## 2. Camada de Domínio

- [x] 2.1 Modelar agregados `Person`, `Employee`, `CompanyEmployment` e `ProvisionalTransportAuthorization` com validação de CPF (dígitos verificadores da RFB), máquina de estados e eventos de domínio.
- [x] 2.2 Definir interfaces de repositório `IWorkforceRepository` e criar testes unitários de domínio em `apps/api/test/workforce.spec.ts`.

## 3. Camada de Infraestrutura

- [x] 3.1 Implementar `PostgresWorkforceRepository` com suporte a transação via `PoolClient`, chaves compostas e concorrência otimista via coluna `version`.

## 4. Camada de Aplicação

- [x] 4.1 Implementar `WorkforceManagementService` orquestrando transações, gravação no `TransactionalOutboxRepository`, auditoria imutável em `audit.audit_records` e isolamento de consultas por `client_company_id`.
- [x] 4.2 Enriquecer testes unitários em `apps/api/test/workforce.spec.ts` validando orquestração, regras de unicidade de CPF e vínculos multi-company.

## 5. Exposição REST e Módulo NestJS

- [x] 5.1 Criar `WorkforceController` com endpoints validados via esquemas Zod para pessoas, colaboradores, vínculos e autorizações provisórias.
- [x] 5.2 Criar `WorkforceModule` encapsulando repositórios e serviços, e registrar o módulo em `apps/api/src/app.module.ts`.

## 6. Verificação e Integração

- [x] 6.1 Criar suíte de integração PostgreSQL `apps/api/test/workforce.integration-spec.ts` validando persistência, isolamento RLS e ausência de vazamento de vínculos entre empresas clientes.
- [x] 6.2 Executar validação de qualidade local (`pnpm lint:api`, `pnpm build:api`, `pnpm test:api`, `pnpm lint:web`, `pnpm build:web`) e preparar commit da proposta.

## Workflow follow-up

- Arquivar a change via OpenSpec após aprovação e execução bem-sucedida do CI.
- Prosseguir para o Incremento M2.3 (`fleet-and-driver-eligibility`).
