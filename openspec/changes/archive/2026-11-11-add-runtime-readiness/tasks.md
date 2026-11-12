# Tasks

## 1. Configuração validada

- [x] 1.1 Implementar schema de ambiente com Zod e verificar por testes valores válidos, defaults e campos inválidos sem exposição de segredos.
- [x] 1.2 Integrar a validação ao `ConfigModule` e verificar que o build da API permanece verde.

## 2. Ciclo de vida das dependências

- [x] 2.1 Implementar provider do pool PostgreSQL com token explícito e verificar o encerramento controlado por teste.
- [x] 2.2 Implementar provider Redis com token explícito e verificar o encerramento controlado por teste.
- [x] 2.3 Preservar `TenantTransaction` sobre o pool compartilhado e verificar que os testes de contexto tenant continuam verdes.

## 3. Health observável

- [x] 3.1 Implementar serviço de readiness concorrente e sanitizado, verificando por testes os cenários healthy, PostgreSQL down e Redis down.
- [x] 3.2 Integrar o serviço ao controller, mantendo liveness independente e verificando respostas HTTP 200/503.
- [x] 3.3 Atualizar README/status com o contrato real e verificar que os exemplos correspondem aos endpoints implementados.

## 4. Verificação integrada

- [x] 4.1 Executar build e testes unitários com pnpm 10 e verificar ausência de falhas.
- [x] 4.2 Executar a API contra PostgreSQL/Redis do Docker e verificar readiness HTTP 200 com ambas as dependências `up`.
- [x] 4.3 Interromper temporariamente uma dependência, verificar readiness HTTP 503 e restaurar o ambiente saudável.
- [x] 4.4 Validar a mudança OpenSpec em modo estrito e confirmar todos os artefatos/tarefas concluídos.

## Workflow follow-up

- Solicitar aprovação do usuário antes de arquivar a mudança.
