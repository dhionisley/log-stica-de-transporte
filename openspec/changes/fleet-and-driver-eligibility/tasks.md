# Tasks

## 1. Schema e Migrations de Banco de Dados

- [x] 1.1 Criar migration `infrastructure/migrations/0008_fleet_and_driver_eligibility.sql` com schema `fleet`, tabelas `fleet.vehicles`, `fleet.vehicle_documents`, `workforce.drivers`, `workforce.driver_eligibilities` e `workforce.driver_documents`, RLS obrigatório via `app.tenant_id`, FKs compostas, controle de versão otimista e permissões seed (`fleet:read`, `fleet:write`, `fleet:admin`, `workforce:driver:read`, `workforce:driver:write`), verificando a sintaxe SQL e integridade das constraints.
- [x] 1.2 Atualizar teste de runner de migrações em `apps/api/test/migration-runner.integration-spec.ts` para incluir a migração 0008 e verificar a execução bem-sucedida via `pnpm test:api`.

## 2. Camada de Domínio de Frota, Condutores e Elegibilidade

- [x] 2.1 Modelar agregado `Vehicle`, entidade `VehicleDocument`, tipos de status (`VehicleStatus`, `OperationalStatus`), normalização de placa e eventos de domínio em `apps/api/src/modules/fleet/domain`, verificando regras e invariantes através de testes unitários em `apps/api/test/fleet.spec.ts`.
- [x] 2.2 Modelar agregado `Driver`, entidade `DriverDocument`, regras de CNH (`DriverLicenseCategory`, vencimento) e eventos de domínio em `apps/api/src/modules/workforce/domain`, verificando regras através de testes unitários em `apps/api/test/driver.spec.ts`.
- [x] 2.3 Implementar motor de domínio `EligibilityService` em `apps/api/src/modules/fleet/domain/eligibility.service.ts` com validação de compatibilidade CNH vs tipo de veículo, vigência de documentos e status operacional, verificando com testes unitários em `apps/api/test/fleet.spec.ts`.

## 3. Camada de Infraestrutura e Persistência Postgres

- [x] 3.1 Implementar `PostgresVehicleRepository` em `apps/api/src/modules/fleet/infrastructure/postgres-vehicle.repository.ts` com isolamento multitenant, RLS, controle de versão (`version`) e queries de documentos.
- [x] 3.2 Expandir `PostgresWorkforceRepository` em `apps/api/src/modules/workforce/infrastructure/postgres-workforce.repository.ts` para persistência e recuperação de motoristas, documentos e elegibilidade.

## 4. Camada de Aplicação, Serviços e Transactional Outbox

- [x] 4.1 Implementar `VehicleManagementService` em `apps/api/src/modules/fleet/application/vehicle-management.service.ts` para cadastro de veículos, manutenção de status, registro de documentos com publicação atômica no Transactional Outbox e auditoria append-only.
- [x] 4.2 Expandir `WorkforceManagementService` em `apps/api/src/modules/workforce/application/workforce-management.service.ts` para qualificação de condutores, registro de documentos de motoristas e suspensão auditada.
- [x] 4.3 Integrar o serviço de elegibilidade na camada de aplicação para fornecer consultas de prontidão operacional de pares motorista-veículo.

## 5. Endpoints REST e Módulo NestJS

- [x] 5.1 Criar DTOs com validação Zod e controllers REST (`VehicleController` em `apps/api/src/modules/fleet/controllers/vehicle.controller.ts` e expansão de `WorkforceController` para rotas de condutores), protegidos por RBAC e autenticação JWT.
- [x] 5.2 Criar `FleetModule` e registrar em `apps/api/src/app.module.ts`, verificando compilação do backend via `pnpm build:api`.

## 6. Testes de Integração e Verificação Completa

- [x] 6.1 Implementar suíte de testes de integração em `apps/api/test/fleet.integration-spec.ts` cobrindo unicidade de placa por tenant, persistência de veículos e documentos, cadastro de condutores e validação do gate de inelegibilidade.
- [x] 6.2 Executar suíte completa de qualidade e testes (`pnpm test:api`, `pnpm lint:api`, `pnpm build:api`, `pnpm lint:web`, `pnpm build:web`) garantindo conformidade total.

## Workflow follow-up

- Apresentar proposta validada ao usuário para aprovação formal.
- Aplicar tarefas implementando os itens e atualizando checkboxes para `[x]`.
- Comitar e fazer push para `main`, acompanhando a execução do CI remoto no GitHub Actions até 100% verde.
- Sincronizar e arquivar a change via OpenSpec CLI (`openspec archive fleet-and-driver-eligibility`).
