# Design

## Context

O Milestone M0 e o primeiro incremento de M1 consolidaram a fundação técnica, a resiliência de migrations (`platform.schema_migrations`), o Transactional Outbox, o log de auditoria append-only (`audit.audit_records`) e o ciclo de vida do Tenant (`platform.tenants`).
A tabela `iam.users` já existe desde a migration `0001_foundation.sql`, mas apenas com os campos essenciais. Para suportar o SaaS Control Plane e controle de acesso granular por tenant (RBAC), é necessário estruturar o catálogo global de permissões, os perfis de permissão tenant-scoped e o serviço de autorização contextual.

## Goals / Non-Goals

**Goals:**
- Criar a migration `0003_iam_rbac.sql` com catálogo global `iam.permissions` e tabelas tenant-scoped `iam.permission_profiles`, `iam.permission_profile_permissions` e `iam.user_profile_assignments`, protegidas por RLS.
- Enriquecer `iam.users` com colunas de normalização (`email_normalized`, `phone_normalized`), controle de MFA (`mfa_required`) e timestamps (`last_login_at`, `updated_at`).
- Modelar entidades puras de domínio `User` e `PermissionProfile` em `apps/api/src/modules/iam/domain/`.
- Implementar repositórios transacionais baseados em `PoolClient` com suporte estrito a RLS.
- Implementar `IamManagementService` e `AuthorizationService` orquestrando o ciclo de vida dos perfis, atribuições a usuários, verificação contextual de permissão, emissão de eventos no Transactional Outbox e gravação em `audit.audit_records`.
- Fornecer endpoints REST e validação com Zod.
- Garantir testes unitários e testes de integração com PostgreSQL demonstrando isolamento RLS e integridade referencial.

**Non-Goals:**
- Emissão de tokens JWT, controle de refresh tokens e gerenciamento de sessões com revogação (incremento posterior de M1).
- Desafio de MFA TOTP/WebAuthn e fluxo de login completo (incremento posterior de M1).
- Cadastro de entidades operacionais como motoristas, frotas ou linhas (Milestone M2).

## Decisions

1. **Catálogo de permissões global vs. por tenant:**
   - *Decisão*: O catálogo `iam.permissions` é global e imutável por tenant. Permissões representam capacidades do sistema (ex.: `tenant:settings:update`, `iam:user:read`, `iam:profile:manage`).
   - *Alternativa descartada*: Permissões customizadas criadas dinamicamente por cada tenant gerariam fragmentação e dificuldade de autorização no código.

2. **Perfis de permissão (Permission Profiles) tenant-scoped:**
   - *Decisão*: Cada tenant cria e gerencia seus próprios perfis em `iam.permission_profiles`, associando um subconjunto de permissões globais via `iam.permission_profile_permissions`.
   - *Alternativa descartada*: Roles rígidas globais não atenderiam a flexibilidade SaaS corporativa descrita na arquitetura.

3. **Chaves estrangeiras compostas tenant-aware:**
   - *Decisão*: Tabelas de associação usam `FOREIGN KEY (tenant_id, profile_id) REFERENCES iam.permission_profiles (tenant_id, id)` e `FOREIGN KEY (tenant_id, user_id) REFERENCES iam.users (tenant_id, id)`.
   - *Justificativa*: Garante no nível de banco de dados que um perfil do Tenant A nunca seja atribuído a um usuário do Tenant B, mesmo se o RLS for acidentalmente desativado em sessões com privilégios de superusuário.

4. **Resolução de autorização contextual:**
   - *Decisão*: O `AuthorizationService` consulta as permissões efetivas do usuário filtrando por `tenant_id`, `user_id` e período de vigência (`effective_from <= now()` e `effective_to IS NULL OR effective_to > now()`).

## Risks / Trade-offs

- **[Carga de consultas de autorização no banco]** → O esquema define índices compostos cobrindo `(tenant_id, user_id, profile_id)` e `(tenant_id, profile_id, permission_code)`. No próximo incremento, haverá cache local/Redis para sessões ativas.
- **[Conflito de migração com banco existente]** → A migration `0003_iam_rbac.sql` usa `ALTER TABLE iam.users ADD COLUMN IF NOT EXISTS` e idempotência padrão, testada com o runner em banco limpo e incremental.

