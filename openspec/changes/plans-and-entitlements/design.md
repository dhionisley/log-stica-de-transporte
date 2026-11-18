# Design: plans-and-entitlements

## Context

A plataforma SaaS multitenant de transporte de pessoas possui controle de tenants (`platform.tenants`), configurações/branding, usuários, perfis de permissão RBAC e autenticação com sessões revogáveis e MFA. Para completar o SaaS Control Plane (Milestone M1, F01 e F31), é necessário estabelecer a governança comercial e operacional: definir quais planos existem, quais limites e funcionalidades cada plano oferece e como vincular uma transportadora (tenant) a uma assinatura ativa com validação estrita de direitos (entitlements) server-side.

## Goals / Non-Goals

**Goals:**
- Criação do catálogo global de planos (`platform.plans`) com seeds dos planos padrão (`STARTER`, `PROFESSIONAL`, `ENTERPRISE`).
- Mapeamento de funcionalidades booleanas (e.g. `realtime_tracking`, `optimization_engine`) e limites quantitativos (e.g. `max_vehicles`, `max_drivers`, `max_monthly_trips`) em `platform.plan_features`.
- Gerenciamento de assinaturas tenant-scoped em `platform.subscriptions` com isolamento RLS e chave composta `(tenant_id, id)`.
- Suporte a `custom_limits` negociados por transportadora que sobrepõem valores padrão do plano.
- Resolução rápida de entitlements com cache Redis (`platform:entitlements:<tenant_id>`) e invalidação automática em mutações.
- `EntitlementGuard` com decorators `@RequireFeature(code)` e `@RequireLimit(code, currentCount)` para proteção de rotas e comandos.
- Emissão atômica de eventos de assinatura no Transactional Outbox e trilha em `audit.audit_records`.

**Non-Goals:**
- Cobrança recorrente de cartão de crédito, boletos ou conciliação bancária via gateways de pagamento (Milestones M11 e M12).
- Emissão de notas fiscais de serviço (NFS-e) para as assinaturas (Milestone M12).
- Portal de autoatendimento financeiro e fatura com checkout externo (fase posterior).

## Decisions

### 1. Separação de Catálogo Global vs Assinatura Tenant-Scoped
- **Decisão**: `platform.plans` e `platform.plan_features` são globais (sem `tenant_id`, compartilhadas pela plataforma). `platform.subscriptions` é estritamente tenant-scoped, protegida por RLS e vinculada por FK a `platform.tenants(id)` e `platform.plans(id)`.
- **Justificativa**: Evita duplicação desnecessária da definição dos planos em cada tenant, garantindo consistência centralizada de regras comerciais e isolando com segurança os dados contratuais de cada cliente.

### 2. Algoritmo de Precedência de Limites (Overlay Pattern)
- **Decisão**: A resolução de direitos avalia:
  1. Limites customizados (`custom_limits` em `platform.subscriptions`), se definidos;
  2. Limites padrão da feature no plano ativo (`platform.plan_features`);
  3. Se a feature não existir ou estiver com status desativado, o acesso é negado por padrão (deny-by-default).
- **Justificativa**: Permite flexibilidade contratual para grandes clientes (enterprise contracts com exceções negociadas) sem a necessidade de criar um plano separado no catálogo para cada negociação pontual.

### 3. Caching Resiliente no Redis
- **Decisão**: A resolução consolidada de entitlements do tenant é mantida em cache no Redis sob a chave `platform:entitlements:<tenant_id>` com TTL de 1 hora.
- **Invalidação**: Qualquer alteração em `platform.subscriptions` (mudança de plano, cancelamento, alteração de `custom_limits`) executa `DEL platform:entitlements:<tenant_id>` na mesma transação/serviço, forçando repovoamento imediato na próxima chamada.

### 4. Guards e Decorators Declarativos no NestJS
- **Decisão**: Disponibilizar o `EntitlementGuard` e os decorators `@RequireFeature('feature_code')` e `@RequireLimit('limit_code')`. O guard recupera o `tenantId` do `RequestContextService` (injetado previamente pelo `JwtAuthGuard`), consulta o `EntitlementService` e rejeita violações antes que cheguem à camada de domínio.
- **Justificativa**: Mantém as regras de proteção limpas, reutilizáveis e declarativas em toda a API do monorepo.

### 5. Ciclo de Vida da Assinatura
- **Decisão**: Estados formais: `ACTIVE`, `PAST_DUE`, `CANCELED`, `SUSPENDED`.
- Transições de estado são disparadas por serviços de aplicação e geram eventos no Transactional Outbox:
  - `SubscriptionCreated`
  - `PlanChanged`
  - `SubscriptionStatusChanged`
  - `CustomLimitsUpdated`

## Risks / Trade-offs

- **[Risco] Sobrecarga de consultas de limites em requisições concorrentes**:
  → *Mitigação*: Uso de cache Redis com chave por tenant, permitindo leitura em sub-milissegundo sem onerar o PostgreSQL.
- **[Risco] Inconsistência de limites em caso de queda temporária do Redis**:
  → *Mitigação*: Fallback transparente para consulta direta ao banco de dados relacional caso a conexão do Redis falhe.

## Migration Plan

1. Executar a migration `0005_plans_and_entitlements.sql` criando `platform.plans`, `platform.plan_features` e `platform.subscriptions` com RLS habilitado.
2. Inserir seeds dos planos base (`STARTER`, `PROFESSIONAL`, `ENTERPRISE`) com limites padrão.
3. Garantir migração retrocompatível: caso tenants existentes não possuam assinatura vinculada, um script inicial associa-os automaticamente ao plano `PROFESSIONAL` como baseline ativo.
4. Rollback: remoção das tabelas da migration 0005 de forma segura sem afetar `platform.tenants` ou `platform.tenant_settings`.
