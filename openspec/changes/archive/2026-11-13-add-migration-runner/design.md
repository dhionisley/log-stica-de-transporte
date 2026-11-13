# Design

## Context

Existe `infrastructure/migrations/0001_foundation.sql`, que já inclui `BEGIN;`/`COMMIT;` próprios. O ADR indica "Drizzle ORM + SQL migrations/custom SQL" e o data model lista a tecnologia de migrations como decisão em aberto, exigindo migrations versionadas e tenant-safe. A API já depende de `pg`.

## Goals / Non-Goals

**Goals:** runner portável, idempotente, com checksum, lock e atomicidade, sem dependência nova.

**Non-Goals:** Drizzle, rollback/down, migrations não transacionais, roles de produção.

## Decisions

### Runner próprio em TypeScript sobre `pg`
Script em `apps/api/src/tooling/migrate` (fora dos módulos de domínio e do bootstrap do Nest), com lógica pura testável separada do CLI. Alternativas (node-pg-migrate, Flyway) rejeitadas para não congelar ferramenta antes da decisão sobre Drizzle e para evitar dependência nova. As migrations continuam SQL puro, compatíveis com qualquer ferramenta futura.

### Tabela de controle
`platform.schema_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now())`, criada pelo runner. Checksum SHA-256 do conteúdo.

### Atomicidade e convencao de transacao
Cada migration deve ser atomica. O runner detecta se o arquivo ja inicia com `BEGIN;` (caso da `0001`, que nao sera alterada):
- **com BEGIN proprio:** executa o arquivo direto e registra o controle em seguida, em transacao propria. Risco de crash entre os dois passos, mitigado por idempotencia (`IF NOT EXISTS`) e pela adocao descrita abaixo;
- **sem BEGIN (convencao para as proximas):** o runner envolve o arquivo e o registro de controle na mesma transacao, garantindo atomicidade total.

### Lock
`pg_advisory_lock` com chave fixa na conexão do runner, liberado no `finally`.

### Adoção de banco existente
Se `platform.tenants` existe e a tabela de controle não, o runner registra `0001` com seu checksum sem executá-la, imprimindo aviso. Evita reaplicar sobre o banco local já migrado.

### Segurança
Erros de conexão são reescritos sem a URL. Nenhuma migration de negócio é adicionada. Migrations futuras tenant-scoped continuam obrigadas a habilitar RLS conforme o data model.

### Testes
Unitários para ordenação, checksum, detecção de BEGIN e mensagens sem credenciais. Integração PostgreSQL em banco/schema isolado cobrindo banco limpo, reexecução, checksum divergente, falha com rollback, lock concorrente e adoção.

## Risks / Trade-offs

- [Crash entre execução e registro em migration com BEGIN próprio] → migrations idempotentes e convenção para novas migrations sem BEGIN.
- [Testes de integração sobre o banco compartilhado interferirem nos existentes] → usar banco temporário criado e removido pelo próprio teste.
- [Runner próprio vira dívida quando Drizzle entrar] → SQL puro mantém portabilidade; substituição futura é isolada em `tooling`.

## Migration Plan

Adicionar runner e testes, trocar `db:migrate` e o passo do CI, atualizar README. Verificar em banco temporário limpo e no banco local existente (adoção). Rollback por revert; não há mudança de schema de negócio.
