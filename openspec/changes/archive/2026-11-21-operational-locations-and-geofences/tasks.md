# Tasks

## 1. Schema e Migrations de Banco de Dados

- [x] 1.1 Criar migration `infrastructure/migrations/0009_service_locations_and_geofences.sql` com schema `service`, tabela `service.service_locations` com suporte PostGIS (`geography(Point, 4326)` e `geography(Polygon, 4326)`), RLS obrigatório via `app.tenant_id`, FKs compostas, índices GIST espaciais e permissões seed (`locations:read`, `locations:write`, `locations:admin`), verificando a sintaxe SQL e integridade das constraints.
- [x] 1.2 Atualizar teste de runner de migrações em `apps/api/test/migration-runner.integration-spec.ts` para incluir a migração 0009 e verificar a estrutura das tabelas via `pnpm test:api`.

## 2. Camada de Domínio de Locais e Geofences

- [x] 2.1 Modelar Value Objects de coordenadas WGS 84 (`GeoPoint`), polígonos de geofence (`GeofencePolygon`), tipos (`LocationType`, `LocationStatus`) e endereço estruturado em `apps/api/src/modules/locations/domain`.
- [x] 2.2 Modelar agregado `ServiceLocation` com regras de validação geométrica, cálculo de contenção espacial e eventos de domínio em `apps/api/src/modules/locations/domain/service-location.entity.ts`, verificando regras e invariantes através de testes unitários em `apps/api/test/locations.spec.ts`.

## 3. Camada de Infraestrutura e Persistência Postgres PostGIS

- [x] 3.1 Implementar `PostgresLocationRepository` em `apps/api/src/modules/locations/infrastructure/postgres-location.repository.ts` com queries PostGIS espaciais (`ST_MakePoint`, `ST_GeomFromGeoJSON`, `ST_AsGeoJSON`, `ST_DWithin`, `ST_Covers`), controle de versão otimista (`version`) e isolamento multitenant.

## 4. Camada de Aplicação, Serviços e Transactional Outbox

- [x] 4.1 Implementar `LocationManagementService` em `apps/api/src/modules/locations/application/location-management.service.ts` para cadastro de locais, atualização de perímetros, avaliação de presença em geofence, com publicação atômica no Transactional Outbox e auditoria append-only.

## 5. Endpoints REST e Módulo NestJS

- [x] 5.1 Criar DTOs com validação Zod e `LocationController` em `apps/api/src/modules/locations/controllers/location.controller.ts`, protegidos por RBAC e autenticação JWT.
- [x] 5.2 Criar `LocationModule` e registrar em `apps/api/src/app.module.ts`, verificando compilação do backend via `pnpm build:api`.

## 6. Testes de Integração e Fechamento do Milestone M2

- [x] 6.1 Implementar suíte de testes de integração em `apps/api/test/locations.integration-spec.ts` cobrindo tipos geográficos PostGIS, avaliação de contenção de geofence e isolamento estrito entre tenants.
- [x] 6.2 Executar suíte completa de qualidade e testes (`pnpm test:api`, `pnpm lint:api`, `pnpm build:api`, `pnpm lint:web`, `pnpm build:web`) garantindo conformidade total e prontidão do Milestone M2.

## Workflow follow-up

- Apresentar proposta validada ao usuário para aprovação formal.
- Aplicar tarefas implementando os itens e atualizando checkboxes para `[x]`.
- Comitar e fazer push para `main`, acompanhando a execução do CI remoto no GitHub Actions até 100% verde.
- Sincronizar e arquivar a change via OpenSpec CLI (`openspec archive operational-locations-and-geofences`).
- Registrar o fechamento do Milestone M2 (Operational Master Data) no status do projeto.
