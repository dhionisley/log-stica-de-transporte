# Tasks

## 1. Banco de Dados e Migrations

- [x] 1.1 Criar migration `infrastructure/migrations/0003_iam_rbac.sql` contendo catálogo global `iam.permissions`, enriquecimento de `iam.users` e tabelas tenant-scoped `iam.permission_profiles`, `iam.permission_profile_permissions` e `iam.user_profile_assignments` com RLS e FKs compostas.
- [x] 1.2 Atualizar testes de migração para suportar a migration 0003 e verificar execução em banco de dados limpo.

## 2. Domínio e Aplicação IAM

- [x] 2.1 Modelar entidades puras `User` e `PermissionProfile` em `apps/api/src/modules/iam/domain/` com invariantes e contratos de persistência.
- [x] 2.2 Implementar repositórios PostgreSQL sobre `PoolClient` gerenciando transações tenant-scoped com `app.tenant_id`.
- [x] 2.3 Implementar `IamManagementService` e `AuthorizationService` para gestão de perfis, atribuição de usuários, verificação contextual de permissão, emissão no Outbox e auditoria imutável.
- [x] 2.4 Implementar controller HTTP de IAM e DTOs validados com Zod em `apps/api/src/modules/iam/controllers/`.

## 3. Testes e Verificação

- [x] 3.1 Implementar testes unitários para entidades e serviços de autorização de IAM.
- [x] 3.2 Implementar testes de integração PostgreSQL cobrindo isolamento RLS, integridade referencial cross-tenant e atomicidade transacional com outbox/audit.
- [x] 3.3 Executar build, linter e testes unitários locais (`pnpm test:api`, `pnpm lint:api`, `pnpm build:api`).
- [x] 3.4 Validar change no OpenSpec (`openspec validate iam-identity-and-rbac --strict`) e monitorar CI no GitHub Actions.

## Workflow follow-up

- Solicitar aprovação antes de iniciar a implementação ou arquivar a change.

