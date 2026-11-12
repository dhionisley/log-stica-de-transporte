# Design

## Context

O pacote contém uma API NestJS mínima, migration PostgreSQL/PostGIS, Redis no Docker Compose e fundações de RLS, Audit, Outbox e Inbox. A motivação está em `proposal.md`. A máquina atual possui Node 26 e pnpm 11, mas não possui Docker, `psql` ou OpenSpec global; o projeto fixa pnpm 10.

## Goals / Non-Goals

**Goals:**

- tornar o bootstrap reproduzível sem alterar a stack;
- registrar OpenSpec no repositório e manter as restrições arquiteturais visíveis;
- cobrir por testes unitários os comportamentos executáveis sem infraestrutura externa;
- distinguir claramente arquivos presentes de componentes realmente verificados.

**Non-Goals:**

- implementar M1, autenticação, UI, dashboard ou domínios operacionais;
- substituir PostgreSQL/PostGIS, Redis, NestJS, Nx/pnpm ou qualquer boundary aprovado;
- simular validação de RLS e declarar equivalência com um PostgreSQL real.

## Decisions

### Usar pnpm 10 de forma efêmera

Executar `npx pnpm@10.0.0` respeita o `packageManager` aprovado sem modificar globalmente a máquina. A alternativa de aceitar automaticamente scripts bloqueados pelo pnpm 11 foi rejeitada porque ampliaria a superfície de execução sem necessidade.

### Inicializar OpenSpec no repositório

OpenSpec 1.15.0 cria `openspec/` e skills do Codex em `.agents/`. O diretório legado `specs/openspec/` permanece como documentação histórica; não será usado como substituto do layout oficial.

### Testar unidades sem fingir infraestrutura

Health controllers e `TenantTransaction` terão testes unitários. Migration, PostGIS, Redis, readiness real e RLS serão marcados como não verificados até Docker/psql estarem disponíveis. Mocks não serão aceitos como prova de isolamento multitenant.

### Preservar o monólito modular

Nenhum novo módulo ou dependência de domínio será criado. Os testes permanecem em `apps/api/test`, conforme a configuração Jest existente.

## Risks / Trade-offs

- [Docker e psql ausentes] → manter gates de banco/RLS pendentes e não arquivar a mudança como completamente verificada.
- [Node 26 é mais novo que o LTS esperado] → registrar a versão usada; CI continua em Node 22 conforme o arquivo aprovado.
- [Readiness atual é estática] → documentar que o endpoint existe, mas ainda não prova PostgreSQL/Redis.
- [RLS pode ser ignorada pelo owner da tabela] → exigir teste futuro com role de aplicação não-owner, conforme comentário do SQL existente.

## Migration Plan

1. Materializar o ZIP sem remover os artefatos originais da pasta pai.
2. Inicializar Git/OpenSpec e gerar o lockfile com pnpm 10.
3. Adicionar testes e documentação de validação.
4. Executar build/testes locais.
5. Quando Docker/psql estiverem disponíveis, executar Compose, migration e o teste RLS usando role não-owner.

Rollback: remover apenas a pasta materializada restaura o estado anterior; o ZIP e os documentos da pasta pai permanecem intactos.

## Open Questions

- Qual instalação de Docker/PostgreSQL será usada na estação Windows? Essa escolha não altera a arquitetura nem as tarefas de código, apenas destrava a verificação externa.
