# Proposal

## Why

Para planejar, roteirizar e validar viagens corporativas e transporte de colaboradores, o sistema requer o cadastro canônico de pontos geográficos e perímetros operacionais (geofences).
O Incremento M2.4 institui o catálogo mestre de locais de atendimento, bases operacionais/garagens e pontos de embarque com coordenadas espaciais PostGIS e cercas eletrônicas para detecção de eventos operacionais, completando o marco de dados mestres operacionais (Milestone M2).

## What Changes

- Criação do schema `service` e tabela `service.service_locations` no PostgreSQL com tipos espaciais PostGIS (`geography(Point, 4326)` e `geography(Polygon, 4326)`).
- Aplicação de RLS estrito em `service.service_locations` com isolamento por `app.tenant_id` e integridade referencial com `platform.tenants` e `crm.client_companies`.
- Modelagem do agregado de domínio `ServiceLocation` com suporte a coordenadas WGS 84, endereço estruturado, raio de captura e polígono de geofence.
- Validação geométrica e regras espaciais no domínio (coordenadas válidas, fechamento de anéis de polígonos e verificação de contenção espacial).
- Implementação de `PostgresLocationRepository` com índices espaciais GIST e queries geoespaciais (`ST_DWithin`, `ST_Contains`).
- Serviço de aplicação `LocationManagementService` com publicação confiável no Transactional Outbox (`LocationCreated`, `LocationUpdated`, `LocationGeofenceUpdated`) e auditoria append-only em `audit.audit_records`.
- Criação de `LocationModule` no NestJS e endpoints REST em `LocationController` validados com esquemas Zod.
- Conclusão oficial e fechamento dos requisitos do Milestone M2 (Operational Master Data).

## Capabilities

### New Capabilities
- `network/locations-and-geofences`: Catálogo mestre de locais operacionais, bases, pontos de parada e geofences PostGIS tenant-scoped.

### Modified Capabilities
<!-- Nenhuma especificação anterior sofre alteração de comportamento contratual -->

## Impact

- Banco de Dados: nova migration `0009_service_locations_and_geofences.sql` utilizando tipos PostGIS (`geography`) já habilitados no banco.
- Backend (`apps/api`): novo módulo `apps/api/src/modules/locations` importado em `AppModule`.
- Permissões RBAC: inserção de permissões `locations:read`, `locations:write` e `locations:admin`.
