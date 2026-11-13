# Tasks

## 1. Núcleo do runner

- [x] 1.1 Implementar descoberta ordenada de arquivos, checksum SHA-256 e detecção de migration transacional; verificar com testes unitários.
- [x] 1.2 Implementar tabela de controle, lock advisory e aplicação atômica; verificar em banco temporário (banco limpo e reexecução).
- [x] 1.3 Implementar falha por checksum divergente e rollback em erro; verificar com testes de integração.
- [x] 1.4 Implementar adoção de banco já migrado e mensagens de erro sem credenciais; verificar com testes.

## 2. Integração ao projeto

- [x] 2.1 Criar CLI e substituir o script `db:migrate`; verificar no PowerShell sem `psql`.
- [x] 2.2 Usar o runner no job de integração do CI e atualizar o README.

## 3. Verificação

- [x] 3.1 Executar lint, build, testes unitários e de integração sem regressões; verificar o banco local existente (adoção).
- [x] 3.2 Confirmar o CI remoto verde, validar OpenSpec em modo estrito e atualizar `docs/ETAPA-10-STATUS.md`.

## Workflow follow-up

- Solicitar aprovação antes de arquivar.

