# Transport Platform — Etapa 10 Bootstrap

Bootstrap executável da plataforma SaaS multitenant de transporte.

## Pré-requisitos
- Node.js LTS
- pnpm 10
- Docker + Compose
- Runner de migrations SQL versionadas em Node.js incluído no projeto (não requer psql instalado no host)

## Subir infraestrutura
```bash
docker compose up -d
cp .env.example .env
export DATABASE_URL=postgresql://transport:transport@localhost:5432/transport
pnpm build:api
pnpm db:migrate
pnpm dev:api
```

No PowerShell (Windows), o comando `pnpm db:migrate` funciona diretamente sem necessidade de instalar cliente PostgreSQL:

```powershell
$env:DATABASE_URL="postgresql://transport:transport@localhost:5432/transport"
pnpm db:migrate
```

O teste RLS exige a role não proprietária de teste:

```powershell
Get-Content -Raw apps/api/test/rls-test-role.sql |
  docker compose exec -T postgres psql -U transport -d transport -v ON_ERROR_STOP=1

$sql = "SET ROLE transport_rls_test;`n" +
  (Get-Content -Raw apps/api/test/rls-isolation.sql)
$sql | docker compose exec -T postgres psql -U transport -d transport -v ON_ERROR_STOP=1
```

Health:
- `GET /internal/api/v1/health/live`
- `GET /internal/api/v1/health/ready`

`live` informa apenas que o processo está executando. `ready` consulta PostgreSQL e Redis: responde HTTP 200 com dependências `up` quando a instância pode receber tráfego e HTTP 503 com a dependência `down` quando alguma delas estiver indisponível.

## Segurança estrutural inicial
A migration cria `tenant_id`, RLS, Audit, Transactional Outbox e Inbox.
O bootstrap ainda NÃO implementa autenticação final nem provider de identidade: isso entra incrementalmente em M1.

## Próximo incremento
O helper de contexto tenant transacional já existe usando `set_config(..., true)` dentro da transação. O próximo incremento deve validar migration e RLS com uma role de aplicação não-owner em PostgreSQL real, integrar readiness a PostgreSQL/Redis e então iniciar Tenant application service e IAM conforme M0/M1.

Consulte `docs/ETAPA-10-STATUS.md` para distinguir componentes presentes, verificados e ainda pendentes.

## Testes

```bash
pnpm test:api
pnpm test:integration
```

Os testes unitários não exigem Docker. `test:integration` exige PostgreSQL/PostGIS local iniciado pelo Compose e comprova Outbox/Inbox, rollback, deduplicação, `SKIP LOCKED` e isolamento RLS com role não proprietária.
