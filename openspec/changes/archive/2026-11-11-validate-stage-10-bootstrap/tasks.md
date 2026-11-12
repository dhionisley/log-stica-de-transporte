# Tasks

## 1. Repositório e processo

- [x] 1.1 Materializar o ZIP em `transport-platform-etapa10` e verificar que os arquivos esperados estão presentes.
- [x] 1.2 Inicializar Git na branch `main`, adicionar `.gitignore` e verificar que `node_modules` não aparece no status.
- [x] 1.3 Inicializar OpenSpec 1.15.0 para Codex, registrar o contexto arquitetural e validar os artefatos da mudança.

## 2. Dependências e API

- [x] 2.1 Instalar somente as dependências declaradas com pnpm 10 e verificar a geração do `pnpm-lock.yaml`.
- [x] 2.2 Adicionar testes do health controller e verificar que os endpoints retornam os estados atualmente documentados.
- [x] 2.3 Adicionar testes do helper `TenantTransaction` e verificar BEGIN, tenant context, COMMIT, ROLLBACK e release.
- [x] 2.4 Executar `pnpm build:api` e verificar compilação TypeScript/NestJS sem erros.

## 3. Infraestrutura e documentação

- Docker Desktop 4.99.0 e Microsoft WSL 2.7.14 instalados; Docker Engine 29.9.3 operacional.
- [x] 3.1 Subir PostgreSQL/PostGIS e Redis com Docker Compose e verificar PostgreSQL `healthy` e Redis `PONG`.
- [x] 3.2 Aplicar `0001_foundation.sql` em banco limpo e verificar criação dos schemas e tabelas.
- [x] 3.3 Executar o teste RLS com role não-owner e verificar isolamento Tenant A/Tenant B.
- [x] 3.4 Atualizar o status da Etapa 10 com evidências executadas, limitações e comandos reproduzíveis.

## Workflow follow-up

- Solicitar aprovação do usuário antes de arquivar a mudança concluída.
