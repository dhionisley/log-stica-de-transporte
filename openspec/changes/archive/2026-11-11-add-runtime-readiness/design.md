# Design

## Context

A API possui endpoint estático de readiness e um helper `TenantTransaction`, mas ainda não possui providers compartilhados para PostgreSQL/Redis nem validação tipada do ambiente. Consulte `proposal.md` para a motivação e `specs/platform/runtime-health/spec.md` para o contrato observável.

## Goals / Non-Goals

**Goals:**

- validar o ambiente uma vez, antes de criar providers;
- manter clients de infraestrutura com ciclo de vida controlado pelo NestJS;
- produzir readiness útil para orquestração sem expor mensagens internas;
- permitir testes unitários determinísticos e uma verificação integrada com Docker.

**Non-Goals:**

- introduzir repositories, Drizzle, autenticação ou lógica tenant-scoped;
- transformar health em observabilidade completa;
- adicionar retries infinitos, circuit breaker ou provider externo.

## Decisions

### Validação central com Zod

`ConfigModule.forRoot` chamará um schema Zod e devolverá um objeto normalizado. A alternativa de validar cada variável dentro de cada provider foi rejeitada por duplicar regras e permitir falha tardia.

### Providers de infraestrutura isolados

`DatabaseModule` será responsável pelo `pg.Pool`; `CacheModule`, pelo client Redis. Tokens explícitos impedem que módulos dependam de detalhes de criação e mantêm infrastructure separado do domínio.

### Readiness concorrente e resposta sanitizada

PostgreSQL e Redis serão verificados em paralelo. O retorno expõe somente `up`/`down`; erros, URLs e credenciais não entram no payload. Qualquer falha produz `ServiceUnavailableException` com HTTP 503.

### Shutdown pelo ciclo de vida NestJS

Providers dedicados implementarão o hook de shutdown e finalizarão `Pool.end()` e `Redis.quit()`. A alternativa de fechar conexões no controller foi rejeitada por misturar apresentação e infraestrutura.

### Isolamento multitenant permanece inalterado

O pool compartilhado não executa queries tenant-scoped por conta própria. Operações tenant-scoped continuam obrigadas a usar transação com `set_config(..., true)` por meio do helper aprovado.

## Risks / Trade-offs

- [Dependência lenta aumenta latência do readiness] → usar operações mínimas (`SELECT 1` e `PING`) e deixar timeouts numéricos para configuração futura aprovada.
- [Erro pode revelar segredo] → mapear exceções para `up`/`down` e não devolver mensagens dos drivers.
- [Shutdown pode ocorrer com dependência já indisponível] → finalizar cada client de forma independente e tolerar estado já encerrado.
- [Readiness positivo não prova isolamento tenant] → manter a suíte RLS separada; health testa disponibilidade, não autorização.

## Migration Plan

1. Adicionar validação de ambiente e seus testes.
2. Adicionar módulos de infraestrutura e shutdown.
3. Substituir readiness estático pelo serviço de verificação e testar cenários.
4. Executar build, testes unitários e teste integrado contra Docker.
5. Rollback: reverter os módulos e restaurar o controller estático; nenhuma migration de dados é necessária.
