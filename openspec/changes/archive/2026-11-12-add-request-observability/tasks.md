# Tasks

## 1. Contexto de requisição

- [x] 1.1 Implementar AsyncLocalStorage encapsulado e verificar isolamento em operações concorrentes.
- [x] 1.2 Implementar middleware de request ID e verificar preservação, substituição e response header.
- [x] 1.3 Capturar trace ID apenas de span ativo e verificar ausência segura sem SDK.

## 2. Logging estruturado

- [x] 2.1 Implementar LoggerService JSON e verificar campos obrigatórios dentro/fora de requisição.
- [x] 2.2 Implementar redaction recursiva/ciclos e verificar ausência de valores sensíveis.
- [x] 2.3 Integrar logger ao NestJS e atualizar documentação.

## 3. Verificação

- [x] 3.1 Executar build, testes unitários e integração PostgreSQL sem regressões.
- [x] 3.2 Verificar endpoint local preservando/gerando `X-Request-Id`.
- [x] 3.3 Validar OpenSpec em modo estrito e concluir tarefas.

## Workflow follow-up

- Solicitar aprovação antes de arquivar.
