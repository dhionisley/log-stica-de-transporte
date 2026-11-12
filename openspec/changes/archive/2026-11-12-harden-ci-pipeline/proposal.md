# Proposal

## Why

O gate do M0 exige build, testes e lint automatizados, e o ADR de CI/CD define lint, unit, integration, build, SAST, SCA e secret scan. O CI atual só roda build e testes unitários, instala com `--frozen-lockfile=false` e nunca executa os testes de integração de RLS, Outbox e Inbox. Falhas de isolamento multitenant poderiam chegar à `main` sem detecção.

## What Changes

- Exigir lockfile congelado (`--frozen-lockfile`) no CI para builds reproduzíveis.
- Adicionar lint (ESLint) ao `apps/api` e um job de lint no CI.
- Subir PostgreSQL/PostGIS e Redis como services no CI e executar `test:integration` sobre migration aplicada em banco limpo.
- Validar a migration `0001_foundation.sql` em banco limpo como etapa explícita do pipeline.
- Adicionar SCA (`pnpm audit` com severidade mínima definida), secret scan e SAST (CodeQL) em jobs separados.
- Fixar a versão do pnpm de forma consistente entre `packageManager` e o workflow.
- Fora do escopo: scan de container/IaC (ainda não existem Dockerfile de produção nem IaC), publicação de artefatos, deploy, runner de migrations (change própria), tracing e skeletons web/mobile.

## Capabilities

### New Capabilities

- `platform/ci-quality-gates`: Gates automatizados de qualidade, integração e segurança no pipeline.

### Modified Capabilities

Nenhuma.

## Impact

- `.github/workflows/ci.yml`, `apps/api/package.json` (devDependencies de lint) e configuração ESLint.
- Dependências novas apenas de desenvolvimento: ESLint e typescript-eslint, a serem justificadas na implementação.
- Documentos afetados: ADR master stack (seção de CI/CD) e implementation plan (gate M0); ambos são respeitados, sem mudança de arquitetura.

