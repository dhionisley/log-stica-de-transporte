# Design

## Context

O Milestone M1 inicia a construção do SaaS Control Plane. No M0 foi estabelecido o transactional outbox, inbox, tracing e a infraestrutura de banco e migrations. Agora é hora de implementar o agregado central do SaaS: o `Tenant`.

## Goals / Non-Goals

**Goals:**
- Migration `0002_tenant_lifecycle.sql` com expansão de `platform.tenants`, `platform.tenant_settings` e `platform.tenant_branding` com RLS.
- Entidade de domínio `Tenant` com métodos de transição de estado (`activate()`, `suspend(reason)`, `reactivate()`, `terminate()`).
- Repositório `PostgresTenantRepository` usando `PoolClient` compartilhado para garantir atomicidade entre agregação, auditoria e outbox.
- Publicação de eventos `TenantProvisioned`, `TenantActivated`, `TenantSuspended`, `TenantTerminated` via `PostgresOutboxRepository`.
- Auditoria append-only em `audit.audit_records`.
- Controller REST para gerenciamento de Tenants em `apps/api/src/modules/platform/controllers`.

**Non-Goals:**
- Autenticação e login (JWT/IdP) - tratado na próxima change (CHG-M1-002).
- Gestão de cobrança, pre-invoices e gateways de pagamento - tratado em M11/M12.

## Decisions

### 1. Modelagem do Banco (Migration 0002)
- Colunas adicionadas em `platform.tenants`:
  - `commercial_name text`
  - `default_timezone text NOT NULL DEFAULT 'America/Sao_Paulo'`
- Nova tabela `platform.tenant_settings`:
  ```sql
  CREATE TABLE platform.tenant_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
    setting_key text NOT NULL,
    setting_value jsonb NOT NULL,
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_setting UNIQUE (tenant_id, setting_key)
  );
  ALTER TABLE platform.tenant_settings ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_settings ON platform.tenant_settings
    USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  ```
- Nova tabela `platform.tenant_branding`:
  ```sql
  CREATE TABLE platform.tenant_branding (
    tenant_id uuid PRIMARY KEY REFERENCES platform.tenants(id) ON DELETE RESTRICT,
    brand_name text NOT NULL,
    logo_asset_id text,
    primary_theme jsonb NOT NULL DEFAULT '{}'::jsonb,
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE platform.tenant_branding ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_branding ON platform.tenant_branding
    USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  ```

### 2. Padrão de Arquitetura e Inversão de Dependência
- Módulo `apps/api/src/modules/platform`:
  - `domain/tenant.entity.ts`: Lógica pura de domínio sem dependência de framework.
  - `domain/tenant.repository.ts`: Interface de repositório (Port).
  - `infrastructure/postgres-tenant.repository.ts`: Implementação SQL (Adapter).
  - `application/tenant-management.service.ts`: Caso de uso orquestrando domínio, outbox e auditoria dentro da transação.
  - `controllers/tenant.controller.ts`: Controller HTTP com DTOs validados via Zod.

### 3. Atomicidade e Outbox
Toda operação que altera um tenant executa na mesma transação de banco:
1. `SELECT ... FOR UPDATE` (se for atualização).
2. Transição no agregado de domínio.
3. Persistência na tabela `platform.tenants`.
4. Inserção do evento no `integration.outbox_events` (mesmo `PoolClient`).
5. Inserção do registro de auditoria em `audit.audit_records` (mesmo `PoolClient`).
6. `COMMIT`.

## Risks / Trade-offs

- [Concorrência em atualização de status] → Uso de lock pessimista (`SELECT FOR UPDATE`) ou versionamento otimista com verificação de `version`. Optamos por versionamento explícito com lock na transação.
- [Dependência de RLS para control plane] → Control plane super-admin opera sem `app.tenant_id` definido utilizando o pool direto quando gerencia múltiplos tenants, enquanto endpoints tenant-scoped utilizam o `TenantTransaction`.

## Migration Plan

Aplicar `infrastructure/migrations/0002_tenant_lifecycle.sql` usando o runner portável em Node.js (`pnpm db:migrate`). Testar em banco limpo e no banco existente sem perda de dados.

