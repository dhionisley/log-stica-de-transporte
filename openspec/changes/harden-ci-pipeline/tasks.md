# Tasks

## 1. Reprodutibilidade e lint

- [x] 1.1 Alinhar versão do pnpm entre `packageManager` e workflow; usar `--frozen-lockfile` e verificar instalação limpa local.
- [x] 1.2 Adicionar ESLint e typescript-eslint em `apps/api` (devDependencies), script `lint` e configuração mínima; justificar dependências.
- [x] 1.3 Executar lint, corrigir apenas violações de erro e verificar que build e testes seguem verdes.

## 2. Integração no CI

- [x] 2.1 Separar o workflow em jobs `quality`, `integration` e `security`.
- [x] 2.2 Configurar services PostgreSQL/PostGIS e Redis com healthcheck no job de integração.
- [ ] 2.3 Aplicar `0001_foundation.sql` em banco limpo e executar `test:integration`; verificar localmente o mesmo fluxo contra o Docker Compose.

## 3. Segurança

- [x] 3.1 Adicionar SCA com `pnpm audit --audit-level high` e verificar resultado atual.
- [ ] 3.2 Adicionar secret scan (gitleaks) e verificar que não expõe valores nos logs.
- [x] 3.3 Adicionar CodeQL para JavaScript/TypeScript.

## 4. Verificação

- [ ] 4.1 Validar o workflow (sintaxe YAML) e executar build, unit e integração locais sem regressões.
- [ ] 4.2 Atualizar `docs/ETAPA-10-STATUS.md` e validar OpenSpec em modo estrito.

## Workflow follow-up

- Confirmar a execução do CI remoto após push, a cargo do usuário.
- Solicitar aprovação antes de arquivar.

