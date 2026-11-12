# Etapa 10 — Bootstrap Status

## Presente no bootstrap
- monorepo/workspace skeleton;
- NestJS API bootstrap;
- health/live e health/ready básicos, ainda sem dependências reais no readiness;
- PostgreSQL/PostGIS local;
- Redis local;
- schemas foundation;
- Tenant table;
- IAM user skeleton;
- tenant-scoped RLS policies;
- Audit append-only table;
- Transactional Outbox;
- Inbox/dedup foundation;
- tenant transaction helper using transaction-local `app.tenant_id`;
- CI skeleton;
- OpenSpec 1.15.0 inicializado para Codex;
- optimization service boundary;
- mobile/web placeholders.

## Verificado em 2026-11-10

- repositório materializado e Git inicializado na branch `main`;
- dependências instaladas com pnpm 10 e lockfile gerado;
- build NestJS/TypeScript concluído;
- 2 suítes e 4 testes unitários de health e tenant transaction aprovados;
- API iniciada localmente e endpoints `health/live` e `health/ready` consultados com sucesso;
- arquitetura e restrições registradas no OpenSpec.

## Verificado em 2026-11-11

- Docker Desktop 4.99.0, WSL 2.7.14 e Docker Engine 29.9.3 operacionais;
- PostgreSQL/PostGIS e Redis iniciados pelo Docker Compose;
- PostgreSQL reportou `healthy` e Redis respondeu `PONG`;
- migration `0001_foundation.sql` aplicada em banco limpo;
- extensões PostGIS e pgcrypto, schemas, tabelas, policies e índices criados;
- teste RLS executado com a role não proprietária `transport_rls_test`;
- Tenant A não conseguiu visualizar o usuário pertencente ao Tenant B.

## Runtime readiness M0

- configuração obrigatória validada com Zod antes da inicialização;
- providers compartilhados para PostgreSQL e Redis com shutdown controlado;
- `health/live` permanece independente das dependências;
- `health/ready` consulta PostgreSQL e Redis em paralelo;
- readiness responde HTTP 200 quando ambas estão disponíveis e HTTP 503 quando qualquer uma falha;
- payload informa apenas `up`/`down`, sem expor mensagens ou credenciais dos drivers.
- build NestJS agora usa `tsconfig.build.json`, exclui testes e limpa `dist` para impedir execução de artefatos antigos;
- verificação integrada confirmou a sequência readiness 200 → 503 com Redis indisponível → 200 após restauração.

## Transactional Outbox + Inbox M0

- contrato interno de evento versionado sem dependência de framework;
- append Outbox recebe o mesmo `PoolClient` da transação de domínio;
- claim de pendências usa ordenação e `FOR UPDATE SKIP LOCKED`;
- marcação de publicação altera somente evento ainda pendente;
- Inbox deduplica por tenant, consumer e message ID e devolve o resultado anterior;
- falha do consumer reverte claim e efeito na mesma transação;
- suíte Jest de integração separada dos testes unitários;
- 8 testes de integração PostgreSQL aprovados, incluindo commit, rollback, concorrência, repetição e isolamento Outbox/Inbox entre tenants.

## Deliberadamente ainda não implementado
- Identity Provider/auth final;
- MFA;
- permission profiles;
- production-ready DB role provisioning;
- Drizzle schemas/repositories;
- BullMQ workers;
- OpenTelemetry exporter/backend;
- Next.js app bootstrap;
- Flutter projects;
- production IaC/cloud.

Esses itens são os próximos incrementos de M0/M1; não devem ser considerados prontos apenas porque os diretórios existem.

## Request observability M0

- AsyncLocalStorage encapsulado em provider global, com isolamento verificado em requisicoes concorrentes;
- middleware preserva X-Request-Id valido, substitui invalido por UUID e devolve o header;
- trace ID so e registrado quando existe span ativo (sem SDK, o campo e omitido);
- logger JSON estruturado integrado ao NestJS, com redaction recursiva e protecao contra referencias circulares;
- 5 suites e 18 testes unitarios aprovados; integracao PostgreSQL e verificacao HTTP local pendentes de acesso ao Docker/rede no ambiente do agente.

- verificado em 2026-11-12: 8 testes de integracao PostgreSQL aprovados sem regressao; endpoint local preservou X-Request-Id valido (abc-123) e gerou UUID para valor invalido.

## CI quality gates M0

- CI separado em jobs quality (lint, build, unit), integration (PostGIS + Redis, migration em banco limpo, integracao) e security (pnpm audit, gitleaks, CodeQL);
- instalacao com --frozen-lockfile e versao do pnpm vinda de packageManager;
- ESLint 9 + typescript-eslint adicionados como devDependencies de apps/api; lint sem erros;
- verificado localmente em 2026-11-12: lint, build, 18 testes unitarios, 8 de integracao e pnpm audit (sem severidade alta/critica; 1 baixa e 5 moderadas);
- pendente: execucao do CI remoto no GitHub (gitleaks e CodeQL so rodam la) e scan de container/IaC, fora do escopo ate existir Dockerfile/IaC.

- CI remoto verificado em 2026-11-12 no GitHub Actions (commit 0911a18): quality, integration (migration em banco limpo + 8 testes) e security (audit, gitleaks sem vazamentos, CodeQL) aprovados;
- avisos nao bloqueantes: Node 20 nas actions, codeql-action@v3 sera descontinuado em dez/2026 e migracao do ubuntu-latest.

## Database migrations runner M0

- runner portavel em Node.js (sem dependencia de psql no host) implementado em apps/api/src/tooling;
- controle por tabela platform.schema_migrations com checksum SHA-256 e advisory lock exclusivo;
- suporte a adocao automatica de schemas legados (0001 adotada com sucesso no banco local);
- rollback e protecao contra migrations corrompidas comprovados por testes de integracao;
- script db:migrate e job de integracao do CI atualizados para usar o novo runner;
- 6 suites e 28 testes unitarios + 2 suites e 13 testes de integracao aprovados.
