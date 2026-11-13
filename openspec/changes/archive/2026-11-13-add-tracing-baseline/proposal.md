# Proposal

## Why

O gate de engenharia do Milestone M0 exige rastreabilidade ponta a ponta ("trace request end-to-end"). A API já possui `@opentelemetry/api` e o middleware de observabilidade está preparado para capturar o `trace_id` de spans ativos, porém ainda não há um SDK inicializado. Sem o SDK, nenhum span é criado, o contexto W3C Trace Context (`traceparent`) não é propagado e os logs continuam sem correlação de trace distribuído.

## What Changes

- Inicializar o OpenTelemetry TracerProvider / SDK no ciclo de vida da API com inicialização limpa antes do bootstrap do NestJS e shutdown gracioso nos hooks de terminação.
- Habilitar propagação padrão W3C Trace Context (`traceparent`), preservando o `trace_id` recebido ou gerando um novo span raiz determinístico por requisição.
- Vincular o span ativo ao fluxo assíncrono da requisição, garantindo que o `request-context.middleware` e o `StructuredLogger` emitam o `trace_id` correspondente.
- Manter o exportador desacoplado e seguro para execução local/testes sem exigir collector ou backend remoto (suportando InMemorySpanExporter em testes e desativação segura sem rede por padrão).
- Adicionar testes automatizados cobrindo geração de trace ID, propagação de cabeçalho `traceparent` externo, presença de `trace_id` nos logs e encerramento limpo do SDK.
- Fora do escopo: metrics OTel, exporters de produção para vendors específicos (Datadog/Jaeger/NewRelic), amostragem probabilística avançada e instrumentações automáticas intrusivas.

## Capabilities

### New Capabilities

- `platform/tracing-baseline`: Inicialização e propagação básica de traces OpenTelemetry correlacionados a requisições e logs.

### Modified Capabilities

Nenhuma.

## Impact

- Bootstrap da API (`main.ts`) e módulo `observability`.
- Adição justificada de dev/runtime packages mínimos do OpenTelemetry (`@opentelemetry/sdk-trace-base` ou `@opentelemetry/sdk-node`, `@opentelemetry/core`).
- Não quebra retrocompatibilidade de logs ou de endpoints existentes.

