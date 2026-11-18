# Tasks

## 1. Banco de Dados e Migrations

- [ ] 1.1 Criar migration `infrastructure/migrations/0005_plans_and_entitlements.sql` com `platform.plans`, `platform.plan_features` e `platform.subscriptions` com RLS habilitado, FKs tenant-aware e seeds dos planos base (`STARTER`, `PROFESSIONAL`, `ENTERPRISE`).
- [ ] 1.2 Atualizar testes de migração e verificar execução da migration 0005 em banco de dados limpo com validação de schemas e constraints.

## 2. Domínio de Planos e Assinaturas

- [ ] 2.1 Modelar entidades de domínio puras `Plan`, `PlanFeature` e `Subscription` com máquina de estados e validações de invariantes em `apps/api/src/modules/platform/domain/`.
- [ ] 2.2 Definir interfaces de repositório em `apps/api/src/modules/platform/domain/subscription.repository.ts` e implementar versões PostgreSQL sobre `PoolClient` com `app.tenant_id` e RLS.

## 3. Serviços de Aplicação e Cache Redis

- [ ] 3.1 Implementar `EntitlementService` com resolução consolidada de limites (overlay de `custom_limits`), cache no Redis (`platform:entitlements:<tenant_id>`) e fallback seguro no PostgreSQL.
- [ ] 3.2 Implementar `SubscriptionManagementService` gerenciando criação, transições de status e troca de plano com emissão atômica no Transactional Outbox e auditoria append-only.
- [ ] 3.3 Implementar `EntitlementGuard` e decorators `@RequireFeature` e `@RequireLimit` para interceptação declarativa de endpoints na API.

## 4. Controladores HTTP e Validação

- [ ] 4.1 Implementar `PlanController` e `SubscriptionController` com endpoints REST protegidos e validados com esquemas Zod em `apps/api/src/modules/platform/controllers/`.
- [ ] 4.2 Registrar novos repositórios, serviços, controllers e guards no `PlatformModule`.

## 5. Testes e Verificação Integrada

- [ ] 5.1 Implementar testes unitários para cálculo de precedência de limites, validação de invariantes de assinatura e guards de entitlement.
- [ ] 5.2 Implementar testes de integração PostgreSQL + Redis cobrindo provisionamento de plano, upgrade/downgrade, sobreposição de limites customizados e isolamento RLS cross-tenant.
- [ ] 5.3 Executar build, linters e testes locais (`pnpm test:api`, `pnpm lint:api`, `pnpm build:api`, `pnpm lint:web`, `pnpm build:web`).
- [ ] 5.4 Validar change no OpenSpec (`openspec validate plans-and-entitlements --strict`) e submeter para revisão.

## Workflow follow-up

- Solicitar aprovação do usuário antes de iniciar a implementação com apply change.
- Acompanhar execução do CI no GitHub Actions após a implementação.
