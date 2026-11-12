# Proposal

## Why

O endpoint `health/ready` responde sucesso sem verificar PostgreSQL ou Redis, podendo permitir tráfego para uma instância incapaz de operar. O primeiro incremento M0 precisa transformar readiness em uma evidência real e validar a configuração antes de iniciar a API.

## What Changes

- Validar `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL` e `OTEL_SERVICE_NAME` na inicialização.
- Criar providers de infraestrutura para o pool PostgreSQL e o cliente Redis usando as bibliotecas já aprovadas.
- Manter liveness independente das dependências externas.
- Alterar readiness para consultar PostgreSQL e Redis e retornar HTTP 503 quando qualquer dependência estiver indisponível.
- Encerrar conexões PostgreSQL/Redis durante o shutdown da aplicação.
- Adicionar testes automatizados para configuração, dependências saudáveis e falhas parciais.
- Fora do escopo: autenticação, Tenant application service, IAM completo, tracing/exporters, Outbox publisher, dashboard e qualquer mudança de arquitetura.

## Capabilities

### New Capabilities

- `platform/runtime-health`: Define validação de configuração, liveness do processo e readiness dependente de PostgreSQL e Redis.

### Modified Capabilities

Nenhuma. Ainda não existem specs OpenSpec ativas no projeto.

## Impact

- API interna: `GET /internal/api/v1/health/ready` passa a refletir dependências reais e pode responder 503.
- Runtime: criação e encerramento de conexões PostgreSQL/Redis.
- Configuração: variáveis inválidas ou ausentes impedem a inicialização.
- Dependências: nenhuma nova biblioteca; serão reutilizadas `@nestjs/config`, `zod`, `pg` e `ioredis`.
- Documentos preservados: ADR de stack, architecture, observability/DR, implementation plan e módulo map; não há alteração silenciosa nas decisões congeladas.
