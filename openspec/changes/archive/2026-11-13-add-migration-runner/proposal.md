# Proposal

## Why

O gate do M0 exige que a migration suba um banco limpo de forma reproduzível. Hoje o script `db:migrate` usa `psql "$DATABASE_URL"`, sintaxe de shell POSIX que não funciona no PowerShell, só existe a migration `0001`, e não há registro de quais migrations já foram aplicadas nem proteção contra reexecução ou alteração de arquivo já aplicado. O CI duplica a chamada `psql`.

## What Changes

- Adicionar um runner de migrations SQL versionadas, portável (Node, sem `psql`), que lê `infrastructure/migrations/*.sql` em ordem.
- Registrar migrations aplicadas em tabela de controle, com nome, checksum e data de aplicação.
- Aplicar apenas migrations pendentes; reexecutar é idempotente.
- Falhar quando o checksum de uma migration já aplicada divergir do arquivo.
- Serializar execuções concorrentes com advisory lock do PostgreSQL.
- Executar cada migration em transação, revertendo por completo em caso de erro.
- Substituir `db:migrate` por script que usa o runner e usar o runner no job de integração do CI.
- Fora do escopo: Drizzle ORM e schemas, migrations de rollback/down, migrations fora de transação, novas tabelas de negócio e provisionamento de roles de produção.

## Capabilities

### New Capabilities

- `platform/database-migrations`: Aplicação versionada, auditável e reproduzível de migrations SQL.

### Modified Capabilities

- `platform/ci-quality-gates`: o job de integração passa a usar o runner. Os requisitos não mudam, então não há delta.

## Impact

- `package.json` (scripts), novo código do runner em `apps/api`, README e `ci.yml`.
- Nenhuma dependência nova: usa `pg`, já aprovada.
- A migration `0001_foundation.sql` continua inalterada, e o ADR "Drizzle ORM + SQL migrations" não é contrariado.
- Bancos já migrados manualmente (como o do Docker Compose local) precisam de adoção: o runner deve registrar a `0001` sem reexecutá-la, caso o schema já exista.

