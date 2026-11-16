# platform/tenant-lifecycle Specification

## Purpose

Define os requisitos para o ciclo de vida, persistência e emissão de eventos do agregado Tenant no SaaS Control Plane da plataforma.

## Requirements

### Requirement: Ciclo de vida estrito do Tenant
O sistema MUST gerenciar o estado do Tenant respeitando as transições: `PROVISIONED` -> `ACTIVE` -> `SUSPENDED` -> `ACTIVE` ou `TERMINATED`.

#### Scenario: Ativação de Tenant provisionado
- **WHEN** um Tenant no estado `PROVISIONED` é ativado
- **THEN** seu status transiciona para `ACTIVE` e a data de atualização é renovada

#### Scenario: Suspensão de Tenant ativo
- **WHEN** um Tenant ativo é suspenso por motivo administrativo ou financeiro
- **THEN** seu status transiciona para `SUSPENDED`, seus dados permanecem preservados e eventos subsequentes refletem o estado suspenso

#### Scenario: Transição inválida rejeitada
- **WHEN** uma transição proibida é solicitada (ex.: reativar um Tenant `TERMINATED`)
- **THEN** o sistema rejeita a operação com erro de regra de negócio e não altera o banco de dados

### Requirement: Publicação atômica de eventos de Tenant via Outbox
Toda mudança de estado do Tenant MUST gravar um evento de integração correspondente na tabela `integration.outbox_events` na mesma transação.

#### Scenario: Provisionamento de novo Tenant
- **WHEN** um novo Tenant é provisionado com sucesso
- **THEN** o evento `TenantProvisioned` é inserido na tabela outbox com correlation_id, schema_version e payload estruturado

#### Scenario: Falha transacional
- **WHEN** a persistência da alteração do Tenant falha
- **THEN** nenhum evento outbox órfão é gravado (rollback completo)

### Requirement: Auditoria imutável de ações no Tenant
Toda criação ou alteração de estado do Tenant MUST registrar um registro em `audit.audit_records` indicando a ação, ator, motivo e estado anterior/novo.

#### Scenario: Registro de auditoria em suspensão
- **WHEN** um Tenant é colocado em suspensão
- **THEN** um registro de auditoria imutável é gravado com `action = 'TENANT_SUSPENDED'`, o tenant_id correspondente e os metadados da operação

### Requirement: Isolamento multitenant de configurações e branding
As tabelas `platform.tenant_settings` e `platform.tenant_branding` MUST conter `tenant_id` e políticas RLS ativas que impedem que Tenant A visualize ou modifique configurações do Tenant B.

#### Scenario: Consulta de configurações com RLS
- **WHEN** uma sessão com `app.tenant_id = Tenant A` consulta configurações
- **THEN** apenas as configurações de Tenant A são retornadas, mesmo que existam registros de Tenant B
