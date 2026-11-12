# Design

## Context

As tabelas `integration.outbox_events` e `integration.inbox_messages`, suas chaves e policies RLS já existem na migration foundation. O código possui `TenantTransaction`, mas o módulo Outbox está vazio. Consulte a proposal para motivação e a spec para o comportamento exigido.

## Goals / Non-Goals

**Goals:**

- fornecer contratos internos independentes de broker;
- obrigar o caller a fornecer o `PoolClient` transacional;
- suportar claim concorrente seguro com PostgreSQL;
- deduplicar consumer e efeito na mesma transação;
- comprovar o comportamento contra PostgreSQL/RLS real.

**Non-Goals:**

- executar loop de publicação, retry, backoff ou dead-letter;
- definir schemas de eventos de domínios ainda não implementados;
- criar role privilegiada cross-tenant para workers;
- expor endpoints HTTP.

## Decisions

### Repositories recebem `PoolClient`

Outbox/Inbox não abrem transações próprias. O application service futuro usa `TenantTransaction` e passa o mesmo client usado pela alteração do agregado. A alternativa de receber apenas `Pool` permitiria commits separados e foi rejeitada.

### Evento possui ID fornecido pelo caller

O contrato exige `eventId`, tipo versionado, aggregate, version, correlation/causation e payload mínimo. Fornecer ID antes da persistência permite rastreabilidade e retry determinístico sem depender do default do banco.

### Claim usa `FOR UPDATE SKIP LOCKED`

Eventos pendentes são ordenados por `occurred_at, id`, limitados e bloqueados dentro da transação. Workers concorrentes pulam registros já reivindicados. A transação deve permanecer curta e o broker futuro continuará fora dela.

### Inbox usa insert de claim e resultado na mesma transação

`INSERT ... ON CONFLICT DO NOTHING` decide o primeiro processamento. Se inseriu, executa o trabalho e atualiza `result`; se houve conflito, lê e devolve o resultado anterior. Erro no trabalho reverte claim e efeito juntos.

### Toda operação continua tenant-scoped

O repository não aceita `tenant_id` para autorizar acesso. O tenant é estabelecido no backend com `set_config(..., true)` e o ID é usado somente para inserção consistente sob RLS.

## Risks / Trade-offs

- [Worker mantém lock durante envio externo] → esta mudança não envia ao broker; o publisher futuro deverá separar claim/lease de chamadas lentas conforme ADR próprio.
- [Payload JSON sem schema específico] → contrato exige tipo/version e payload mínimo; schemas por evento serão adicionados com os módulos de domínio.
- [Resultado Inbox nulo pode representar mensagem ainda em processamento] → segunda transação aguarda a resolução do conflito de chave; commit entrega resultado, rollback permite novo claim.
- [Role owner ignora RLS] → integração executa `SET LOCAL ROLE transport_rls_test` antes de estabelecer o tenant.

## Migration Plan

1. Adicionar contratos e repositories sem alterar tabelas.
2. Adicionar testes unitários de SQL/fluxo.
3. Adicionar suíte de integração separada usando PostgreSQL Docker e role não-owner.
4. Executar commit, rollback, deduplicação, claim e isolamento.
5. Rollback: remover módulo/repositories; nenhuma migration nova precisa ser revertida.
