# Tasks

## 1. Contratos e Outbox

- [x] 1.1 Definir contrato mínimo de evento versionado sem dependência de framework e verificar tipos pelo build.
- [x] 1.2 Implementar append Outbox com `PoolClient` fornecido e verificar commit/rollback por integração PostgreSQL.
- [x] 1.3 Implementar claim de pendências com ordenação e `SKIP LOCKED`, verificando exclusão de publicados.
- [x] 1.4 Implementar marcação idempotente de publicação e verificar primeira/repetida confirmação.

## 2. Inbox idempotente

- [x] 2.1 Implementar claim Inbox por tenant/consumer/message e verificar execução única em entrega repetida.
- [x] 2.2 Persistir resultado na mesma transação e verificar devolução do resultado anterior.
- [x] 2.3 Verificar rollback de claim/efeito quando o trabalho falha e nova tentativa subsequente.

## 3. Isolamento e testes

- [x] 3.1 Configurar suíte Jest de integração separada e verificar que testes unitários não dependem do Docker.
- [x] 3.2 Executar integração com role não-owner e verificar isolamento Outbox/Inbox entre Tenant A e B.
- [x] 3.3 Executar build, testes unitários e integração PostgreSQL sem falhas.
- [x] 3.4 Atualizar documentação de status e validar OpenSpec em modo estrito.

## Workflow follow-up

- Solicitar aprovação do usuário antes de arquivar a mudança.
