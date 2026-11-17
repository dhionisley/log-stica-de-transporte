# Proposal

## Why

A plataforma SaaS multitenant requer controle de acesso granular baseado em perfis (RBAC) e autorização contextual por tenant, garantindo que usuários possuam identidades bem definidas, pertençam a um tenant específico com RLS estrito e recebam permissões auditáveis via perfis de acesso (`iam.permission_profiles`). Essa entrega atende ao marco M1 (SaaS Control Plane + IAM) da arquitetura aprovada.

## What Changes

- Criação da migration `0003_iam_rbac.sql`:
  - Enriquecimento da tabela `iam.users` com colunas de normalização (`email_normalized`, `phone_normalized`), controle de MFA (`mfa_required`) e timestamps (`last_login_at`, `updated_at`).
  - Criação do catálogo global `iam.permissions` (`code` PK, `resource`, `action`, `description`).
  - Criação das tabelas tenant-scoped `iam.permission_profiles`, `iam.permission_profile_permissions` e `iam.user_profile_assignments` com políticas de RLS vinculadas a `app.tenant_id`.
  - Foreign keys compostas tenant-aware `(tenant_id, profile_id)` e `(tenant_id, user_id)` impedindo associações cross-tenant.
- Criação do módulo de domínio e aplicação IAM em `apps/api/src/modules/iam/`:
  - Entidade agregada `User` e agregado `PermissionProfile`.
  - Contratos de repositório e implementação transacional com PostgreSQL e RLS.
  - Serviço de domínio/aplicação `IamManagementService` e `AuthorizationService` orquestrando criação de perfis, atribuição a usuários, verificação contextual de permissão, emissão de eventos no Transactional Outbox (`UserCreated`, `PermissionProfileCreated`, `UserProfileAssigned`) e auditoria append-only em `audit.audit_records`.
  - Endpoints REST validados com Zod no controller de IAM.
- Fora do escopo deste incremento:
  - Fluxo completo de autenticação OAuth2/OIDC, tokens JWT/sessões revogáveis e MFA WebAuthn/TOTP (incremento seguinte de M1).
  - Módulos operacionais de dados mestres de frotas e motoristas (Milestone M2).

## Capabilities

### New Capabilities
- `platform/iam-rbac`: Catálogo global de permissões, gerenciamento de perfis de permissão tenant-scoped (PermissionProfile), vinculação de usuários a perfis e resolução contextual de autorização com RLS e auditoria.

### Modified Capabilities
Nenhuma capability existente tem seus requisitos modificados.

## Impact

- Banco de dados: Migration `0003_iam_rbac.sql` executada de forma idempotente e segura com o runner existente.
- API NestJS: Novo módulo `IamModule` integrado ao monorepo com injeção de dependências desacoplada de frameworks de persistência.
- Documentos de arquitetura: `data-model-plataforma-transporte.md`, `security-plataforma-transporte.md` e `domain-model-plataforma-transporte.md` seguidos rigorosamente sem qualquer desvio ou quebra de invariantes.

