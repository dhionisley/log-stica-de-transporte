# Design

## Context

O workflow `ci.yml` possui um job `api` que instala, compila e roda testes unitários. Existem testes de integração em `apps/api/test/*.integration-spec.ts` que dependem de PostgreSQL (`TEST_DATABASE_URL`, padrão `transport:transport@127.0.0.1:5432/transport`). Não há ESLint instalado. O ADR de CI/CD já define o conjunto de gates.

## Goals / Non-Goals

**Goals:** pipeline reproduzível, integração com banco real, lint e segurança básica, sem mudar arquitetura nem código de domínio.

**Non-Goals:** container/IaC scan, publicação de artefatos, deploy, runner de migrations, tracing, web/mobile.

## Decisions

### Jobs separados e paralelos
Jobs `quality` (install, lint, build, unit), `integration` (services + migration + integração) e `security` (SCA, secret scan, CodeQL). Falhas ficam localizadas e o job de integração não bloqueia o feedback de lint.

### Services PostgreSQL/PostGIS e Redis
O job de integração usa a mesma imagem `postgis/postgis:17-3.5` do Docker Compose, com healthcheck. A migration é aplicada com `psql` do runner Linux, o que também valida o SQL em banco limpo. Isso é provisório até a change do runner de migrations.

### Lockfile congelado
Substituir `--frozen-lockfile=false` por `--frozen-lockfile`. O lockfile atual já está versionado.

### ESLint com typescript-eslint
Configuração mínima recomendada, apenas em `apps/api`. Alternativa Biome rejeitada para não introduzir tooling fora da stack documentada. Dependências de dev novas serão justificadas na implementação, conforme guidance do projeto.

### Segurança
SCA via `pnpm audit --audit-level high`; secret scan via gitleaks; SAST via CodeQL (JavaScript/TypeScript). Limite inicial: severidade alta ou crítica.

### Versão do pnpm
`packageManager` fixa `pnpm@10.0.0` e o workflow usa versão 10. A implementação alinha ambos para evitar divergência.

## Risks / Trade-offs

- [`pnpm audit` pode falhar por vulnerabilidade transitiva sem correção] → registrar exceção documentada em vez de reduzir o limite silenciosamente.
- [CodeQL e gitleaks adicionam tempo de CI] → jobs paralelos e restritos a `push`/`pull_request`.
- [Lint pode revelar violações no código existente] → corrigir apenas violações de erro, sem refatorações; regras ruidosas ficam como aviso.
- [Migration via psql duplica o script atual] → remover quando o runner de migrations existir.

## Migration Plan

Alterar workflow e adicionar configuração de lint em um único passo reversível por revert. Não há migration de dados. Validar localmente lint, build e testes; o CI remoto só pode ser confirmado após push, o que fica a cargo do usuário.

