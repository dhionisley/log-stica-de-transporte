# Proposal

## Why

As tabelas Outbox e Inbox existem, mas ainda não há application/infrastructure code que garanta escrita atômica, seleção segura de eventos pendentes ou deduplicação de consumers. Sem essa fundação, operações futuras poderiam cair em dual-write ou produzir efeitos duplicados.

## What Changes

- Definir contratos internos versionáveis para eventos de integração.
- Persistir eventos Outbox usando o mesmo `PoolClient` e a mesma transação da alteração de domínio.
- Listar somente eventos não publicados com claim concorrente seguro e marcar publicação de forma idempotente.
- Executar trabalho de consumer uma única vez por tenant, consumer e message ID, devolvendo o resultado anterior em repetições.
- Garantir rollback conjunto quando a operação de domínio, Outbox ou Inbox falhar.
- Automatizar testes unitários e integração PostgreSQL/RLS para commit, rollback, repetição, concorrência básica e isolamento entre tenants.
- Fora do escopo: BullMQ, broker, retries/backoff/dead-letter, publisher em background, payloads de features específicas e API HTTP.

## Capabilities

### New Capabilities

- `platform/reliable-messaging`: Define persistência transacional de Outbox, seleção de pendências e deduplicação Inbox tenant-scoped.

### Modified Capabilities

Nenhuma. `platform/runtime-health` permanece inalterada.

## Impact

- Backend: módulo Outbox, contratos de aplicação e adapters PostgreSQL.
- Banco: reutiliza as tabelas e policies RLS da migration `0001_foundation.sql`; não altera schema nesta mudança.
- Testes: nova suíte de integração contra PostgreSQL real usando role não proprietária.
- Arquitetura preservada: at-least-once, Transactional Outbox, Inbox idempotente, RLS, modular monolith e ausência de dual-write, conforme architecture, events, data-model e implementation-plan.
