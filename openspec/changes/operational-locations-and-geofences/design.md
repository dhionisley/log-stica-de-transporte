# Design

## Context

Com a conclusão dos incrementos M2.1 (`client-companies-master-data`), M2.2 (`people-and-workforce-master-data`) e M2.3 (`fleet-and-driver-eligibility`), o cadastro corporativo, de passageiros e de recursos móveis (veículos e motoristas) está estabelecido.
O Incremento M2.4 institui os locais de embarque, atendimento e garagens operacionais com geolocalização e perímetros de cerca eletrônica, fechando formalmente o marco de dados mestres operacionais (Milestone M2).

## Goals / Non-Goals

**Goals:**
- Criar o schema `service` e a tabela `service.service_locations` com suporte a PostGIS (`geography(Point, 4326)` e `geography(Polygon, 4326)`).
- Assegurar isolamento estrito via RLS (`app.tenant_id`) e integridade referencial com `platform.tenants` e opcionalmente `crm.client_companies`.
- Criar índices espaciais GIST em `point` e `geofence` para alta performance em buscas de proximidade e contenção.
- Modelar o agregado de domínio `ServiceLocation`, Value Object `GeoCoordinates` (WGS 84: latitude [-90, 90], longitude [-180, 180]) e `GeofencePolygon`.
- Implementar verificação de contenção espacial (`containsPoint`).
- Implementar `PostgresLocationRepository` com conversões de/para WKT / GeoJSON.
- Orquestrar operações de aplicação com emissão de eventos no Transactional Outbox e auditoria append-only em `audit.audit_records`.
- Expor API REST com endpoints validados via Zod em `LocationController`.

**Non-Goals:**
- Roteirização dinâmica e otimização de rotas (escopo de Milestone M4 e engine Python).
- Telemetria de telemetria contínua em tempo real (escopo de Milestone M6).

## Decisions

### 1. Tipo Espacial PostGIS `geography` vs `geometry`
- **Decisão**: Utilizar o tipo `geography(..., 4326)` (esferoide WGS 84) em vez de `geometry` plano.
- **Racional**: Conforme especificado na seção 12 e 13 do modelo de dados (`data-model-plataforma-transporte.md`), o tipo `geography` calcula distâncias nativamente em metros e lida perfeitamente com coordenadas GPS globais sem necessidade de conversão/reprojeção para fusos UTM específicos por cidade/estado.

### 2. Geofence Poligonal e Raio Circular Híbrido
- **Decisão**: A tabela suporta tanto `geofence geography(Polygon, 4326)` para perímetros customizados de pátios/fábricas/terminais, quanto `geofence_radius_meters integer` para pontos de embarque circulares simples.
- **Racional**: Atende tanto complexos industriais de clientes (onde o perímetro é um polígono irregular) quanto pontos de parada urbanos simples (onde um raio de 50m ou 100m é suficiente).

### 3. Independência do Domínio
- **Decisão**: O agregado `ServiceLocation` e os Value Objects de coordenadas e geometria residem em `domain/` sem acoplamento a bibliotecas de banco de dados ou PostGIS.
- **Racional**: Respeita o princípio arquitetural fundamental de domínio puro e agnóstico de infraestrutura. A infraestrutura converte entre a representação de domínio e as queries SQL do PostGIS (`ST_SetSRID`, `ST_MakePoint`, `ST_GeomFromGeoJSON`, `ST_AsGeoJSON`).

## Risks / Trade-offs

- **[Risco] Polígonos de geofence inválidos (ex: auto-interseção ou anel aberto)**:
  → *Mitigação*: Validação no domínio (mínimo 4 pontos, primeiro igual ao último) e validação PostGIS `ST_IsValid` na persistência.
- **[Risco] Degradação de performance em consultas geoespaciais com alta concorrência**:
  → *Mitigação*: Índices GIST em `point` e `geofence`, combinados com filtros indexados de `tenant_id` e `status`.

## Migration Plan

1. Criar migration `infrastructure/migrations/0009_service_locations_and_geofences.sql`.
2. Execução via `migration-runner` idempotente.
