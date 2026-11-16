# Proposal

## Why

O Milestone M1 ("SaaS Control Plane + IAM") exige a materialização do agregado `Tenant`, seu ciclo de vida completo (`PROVISIONED`, `ACTIVE`, `SUSPENDED`, `TERMINATED`) e as configurações essenciais da transportadora. No M0, a tabela `platform.tenants` foi criada de forma embrionária (`id`, `slug`, `legal_name`, `status`, `version`, `created_at`, `updated_at`). Para avançar no M1, é necessário completar a modelagem de domínio do Tenant, adicionar suas configurações (`commercial_name`, `default_timezone`), tabelas de branding e settings, emitir eventos de integração no Transactional Outbox para cada transição de ciclo de vida e registrar auditoria imutável de todas as ações de provisionamento e alteração de status.

## What Changes

- Criar migration versionada `0002_tenant_lifecycle.sql` adicionando colunas complementares em `platform.tenants` (`commercial_name`, `default_timezone`), a tabela `platform.tenant_settings` (chave-valor tipada por tenant com RLS) e `platform.tenant_branding` (customização de marca com RLS).
- Implementar o agregado de domínio `Tenant` com máquina de estados de ciclo de vida e invariantes de negócio (transições válidas, imutabilidade de ID e bloqueio de operações quando suspenso).
- Implementar o serviço de aplicação `TenantManagementService` para provisionamento, ativação, suspensão e atualização de configurações.
- Publicar eventos de integração (`TenantProvisioned`, `TenantActivated`, `TenantSuspended`, `TenantTerminated`) atomicamente no Transactional Outbox na mesma transação de banco.
- Registrar evidência de auditoria em `audit.audit_records` para todas as transições de ciclo de vida do Tenant.
- Disponibilizar endpoints internos/control plane (`/internal/api/v1/platform/tenants`) protegidos com validação Zod de payload.
- Fora do escopo deste incremento: autenticação de usuários e emissão de tokens JWT/IdP (CHG-M1-002), catálogo completo de permissões e RBAC (CHG-M1-002), gestão de planos e assinaturas complexas (M11), e fluxo de pagamentos (M12).

## Capabilities

### New Capabilities

- `platform/tenant-lifecycle`: Gestão do ciclo de vida, configurações e eventos do agregado Tenant no SaaS Control Plane.

### Modified Capabilities

Nenhuma.

## Impact

- Banco de dados: migration `0002_tenant_lifecycle.sql` aplicada via runner de migrations oficial.
- Backend API (`apps/api/src/modules/platform`): implementação de entidades de domínio, repositórios, serviços de aplicação e controllers.
- Documentos arquiteturais consultados e preservados: `domain-model-plataforma-transporte.md` (seção 3), `data-model-plataforma-transporte.md` (seção 6), `security-plataforma-transporte.md`, `events-plataforma-transporte.md`. Nenhuma alteração silenciosa ou desvio de arquitetura.

