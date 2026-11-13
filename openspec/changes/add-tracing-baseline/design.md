# Design

## Context

A API possui `@opentelemetry/api` instalado e `OTEL_SERVICE_NAME` validado no schema Zod de ambiente. O middleware `RequestContextMiddleware` já consulta `trace.getSpan(context.active())?.spanContext()?.traceId`, mas sem um SDK registrado globalmente, `context.active()` retorna span no-op sem trace ID. O gate do Milestone M0 exige rastreamento ponta a ponta sem antecipar a escolha do backend de telemetria.

## Goals / Non-Goals

**Goals:**
- Inicializar TracerProvider OpenTelemetry com `NodeTracerProvider` ou `NodeSDK`.
- Suportar propagação W3C (`traceparent`).
- Iniciar span de requisição no middleware (ou handler HTTP) com nome da rota/método.
- Correlacionar `trace_id` automaticamente no `RequestContextService` e no `StructuredLogger`.
- Encerramento gracioso com `shutdown()`.
- Testabilidade e operação em sandbox sem dependência de rede.

**Non-Goals:**
- Métricas (Prometheus, OTel metrics).
- Exporters de vendors específicos (Datadog, Dynatrace, Jaeger etc.).
- Instrumentação automática pesada de bibliotecas nativas.

## Decisions

### 1. Pacotes mínimos do SDK OpenTelemetry
Adicionar dependências necessárias para suporte a Node.js:
- `@opentelemetry/sdk-trace-node` (ou `@opentelemetry/sdk-trace-base` + `@opentelemetry/resources` + `@opentelemetry/semantic-conventions`).
- Justificativa: Esses pacotes são o padrão oficial do ecossistema OpenTelemetry para Node.js e permitem configurar TracerProvider com Resource de serviço.

### 2. Módulo de ciclo de vida do Tracing
Criar serviço ou provider dedicado `TracingService` que:
- Configura o `BasicTracerProvider` / `NodeTracerProvider` com o Resource `{ [ATTR_SERVICE_NAME]: serviceName }`.
- Registra o propagador global W3C (`W3CTraceContextPropagator`).
- Configura um span processor (em memória ou no-op quando nenhum exporter for especificado via env).
- Implementa `OnApplicationShutdown` para chamar `provider.shutdown()`.

### 3. Extração e criação de span na requisição
No `RequestContextMiddleware`:
- Usar `propagation.extract(context.active(), request.headers)` para ler o `traceparent`.
- Obter o tracer (`trace.getTracer('transport-api')`).
- Iniciar um span para a requisição (`HTTP ${method}`) dentro do contexto extraído.
- Executar a continuação da requisição dentro de `context.with(trace.setSpan(extractedContext, span), () => ...)`.
- No final da requisição (evento `finish` da response), finalizar o span (`span.end()`).

### 4. Correlação com RequestContext e Logs
Como o span estará ativo no contexto assíncrono:
- `RequestContextService` armazenará o `traceId` correspondente.
- `StructuredLogger` continuará emitindo o `trace_id` no JSON estruturado, agora preenchido de forma determinística e testável.

## Risks / Trade-offs

- [Conexão assíncrona de spans pode se perder se AsyncLocalStorage do OTel colidir com o próprio] → Ambos usam o `AsyncLocalStorage` nativo do Node.js de forma hierárquica e transparente; testes de concorrência verificarão isolamento.
- [Dependências adicionais aumentam node_modules] → Apenas pacotes oficiais `@opentelemetry/sdk-trace-base` e `@opentelemetry/resources` sem instrumentações automáticas globais invasivas.

## Migration Plan

Adicionar pacotes, configurar o TracerProvider no módulo de observabilidade, atualizar o middleware HTTP para iniciar e fechar spans com propagação W3C, e validar com testes unitários e de integração. Nenhuma migração de banco é necessária.

