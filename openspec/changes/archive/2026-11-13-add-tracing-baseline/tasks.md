# Tasks

## 1. Dependências e Infraestrutura do SDK

- [x] 1.1 Adicionar dependências mínimas oficiais do OpenTelemetry SDK (`@opentelemetry/sdk-trace-base`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`) e justificar.
- [x] 1.2 Implementar inicialização do TracerProvider com nome do serviço e encerramento com `OnApplicationShutdown`.
- [x] 1.3 Configurar propagador W3C (`W3CTraceContextPropagator`) e registrá-lo globalmente.

## 2. Propagação HTTP e Correlação

- [x] 2.1 Atualizar `RequestContextMiddleware` para extrair contexto W3C e iniciar span ativo por requisição.
- [x] 2.2 Fechar o span no evento de conclusão da resposta HTTP.
- [x] 2.3 Conectar o span ativo ao `RequestContextService` e verificar que o `StructuredLogger` emite o `trace_id` correspondente.

## 3. Testes e Verificação

- [x] 3.1 Criar testes unitários para inicialização do TracerProvider, propagação W3C (`traceparent`), geração de novo span raiz e encerramento limpo.
- [x] 3.2 Executar suíte completa (lint, build, testes unitários, testes de integração) e verificar ausência de regressões.
- [x] 3.3 Confirmar pipeline CI verde no GitHub Actions, validar OpenSpec em modo estrito e atualizar `docs/ETAPA-10-STATUS.md`.

## Workflow follow-up

- Solicitar aprovação antes de arquivar.

