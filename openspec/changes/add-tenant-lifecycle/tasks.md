# Tasks

## 1. Banco de Dados e Migrations

- [x] 1.1 Criar migration `infrastructure/migrations/0002_tenant_lifecycle.sql` com colunas de `platform.tenants`, `platform.tenant_settings` e `platform.tenant_branding` com políticas RLS.
- [x] 1.2 Executar `pnpm db:migrate` localmente e validar aplicação ordenada e registro na tabela `platform.schema_migrations`.

## 2. Domínio e Aplicação

- [x] 2.1 Implementar agregado `Tenant` em `apps/api/src/modules/platform/domain` com máquina de estados de ciclo de vida (`PROVISIONED`, `ACTIVE`, `SUSPENDED`, `TERMINATED`).
- [x] 2.2 Implementar `PostgresTenantRepository` implementando o contrato de persistência sobre `PoolClient`.
- [x] 2.3 Implementar `TenantManagementService` orquestrando o ciclo de vida, emissão de eventos no Transactional Outbox e gravação em `audit.audit_records` em transação única.
- [x] 2.4 Implementar controller HTTP e DTOs de entrada validados com Zod em `apps/api/src/modules/platform/controllers`.

## 3. Testes e Verificação

- [x] 3.1 Criar testes unitários para a entidade `Tenant` cobrindo todas as transições válidas e rejeição de transições inválidas.
- [x] 3.2 Criar testes de integração PostgreSQL cobrindo provisionamento, transições de estado, atomicidade com outbox, registro de auditoria e isolamento RLS de configurações.
- [x] 3.3 Executar suíte completa de testes (unitários + integração) e validar compilação sem regressões.
- [ ] 3.4 Confirmar pipeline CI verde no GitHub Actions, validar OpenSpec em modo estrito e atualizar `docs/ETAPA-10-STATUS.md`.

## Workflow follow-up

- Solicitar aprovação antes de arquivar.

