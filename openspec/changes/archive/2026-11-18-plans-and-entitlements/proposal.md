# Proposal: plans-and-entitlements

## Why

Com o ciclo de vida de tenants (`platform/tenant-lifecycle`), RBAC contextual (`platform/iam-rbac`) e autenticação com sessões revogáveis e MFA (`platform/iam-auth-sessions`) concluídos no Milestone M1, o SaaS Control Plane necessita da gestão formal de planos comerciais, assinaturas e governança de entitlements (funcionalidades e limites de uso). Conforme a arquitetura da plataforma (`implementation-plan-plataforma-transporte.md` M1, `domain-model-plataforma-transporte.md` seção 3 e `data-model-plataforma-transporte.md` seção 6), cada transportadora (tenant) opera sob uma assinatura vinculada a um plano que determina suas capacidades operacionais (e.g. rastreamento em tempo real, motor de otimização, limite de veículos, motoristas e viagens). A verificação server-side de entitlements impede consumo de recursos não contratados e viabiliza a monetização e controle granular do SaaS.

## What Changes

- **Catálogo Global de Planos (`platform.plans`)**: Definição de catálogo mestre com códigos estáveis (e.g. `STARTER`, `PROFESSIONAL`, `ENTERPRISE`), nome, descrição, status e versionamento.
- **Funcionalidades e Limites por Plano (`platform.plan_features`)**: Estruturação de limites quantitativos (e.g. `max_vehicles`, `max_drivers`, `max_monthly_trips`) e feature flags booleanas (e.g. `realtime_tracking`, `optimization_engine`, `custom_branding`).
- **Assinaturas Tenant-Scoped (`platform.subscriptions`)**: Vínculo formal entre tenant e plano com status da assinatura (`ACTIVE`, `PAST_DUE`, `CANCELED`, `SUSPENDED`), período de vigência (`starts_at`, `ends_at`), suporte a sobreposição de limites customizados (`custom_limits`) e isolamento RLS com chave composta tenant-aware.
- **Serviço de Entitlements e Assinaturas (`EntitlementService` / `SubscriptionService`)**: Orquestração transacional de provisionamento de plano, upgrade/downgrade, verificação e resolução em tempo de execução de limites e features disponíveis para o tenant.
- **Guards e Interceptors no NestJS**: Decorators `@RequireFeature('realtime_tracking')` e `@RequireLimit('max_vehicles')` integrados ao pipeline de execução da API, bloqueando ações operacionais excedentes com código semântico `PLAN_LIMIT_EXCEEDED` ou `FEATURE_NOT_IN_PLAN`.
- **Eventos no Transactional Outbox e Trilha de Auditoria**: Registro atômico de eventos (`SubscriptionCreated`, `SubscriptionUpdated`, `PlanChanged`, `CustomLimitApplied`) e auditoria imutável em `audit.audit_records`.

## Capabilities

### New Capabilities
- `platform/plans-entitlements`: Catálogo global de planos SaaS, governança de funcionalidades e limites, gestão de assinaturas tenant-scoped e guards de autorização de entitlements em tempo de execução.

### Modified Capabilities
- Nenhuma modificação nos requisitos comportamentais das especificações já existentes (`platform/tenant-lifecycle`, `platform/iam-rbac`, `platform/iam-auth-sessions`).

## Impact

- **Banco de Dados**: Nova migration `infrastructure/migrations/0005_plans_and_entitlements.sql` criando `platform.plans`, `platform.plan_features` e `platform.subscriptions` com RLS habilitado na tabela de assinaturas.
- **Módulo Platform**: Novos agregados `Plan`, `Subscription` e serviços de aplicação em `apps/api/src/modules/platform/`.
- **API & Decorators**: `EntitlementGuard` disponível para interceptar endpoints operacionais nos milestones futuros (M2 a M14).
- **Fora de Escopo**: Faturamento recorrente com gateway de pagamento externo (PIX, cartão, boleto) e emissão de NFS-e (pertencentes aos Milestones M11 e M12).

