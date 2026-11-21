# Proposal

## Why

A plataforma SaaS de transporte corporativo e fretado necessita de governança estrita sobre os recursos físicos que executam o transporte: os veículos da frota (`Vehicle`) e os motoristas habilitados (`Driver`).
Para concluir o cadastro mestre operacional (Milestone M2), é obrigatório estabelecer o cadastro da frota, a qualificação dos motoristas vinculados a pessoas físicas, o controle de matriz de elegibilidade por classe de veículo e a validação de conformidade documental (`compliance documents`), assegurando o gate arquitetural: condutores ou veículos sem documentação válida ou com status inativo/suspenso jamais podem ser escalados para viagens.

## What Changes

- **Banco de Dados & Schema Fleet**: Criação do schema `fleet` e tabelas `fleet.vehicles` e `fleet.vehicle_documents` com RLS obrigatório via `app.tenant_id`, chaves compostas tenant-aware e concorrência otimista via coluna `version`.
- **Expansão de Schema Workforce**: Criação das tabelas `workforce.drivers`, `workforce.driver_eligibilities` e `workforce.driver_documents` com integridade referencial composta tenant-aware e RLS forçado.
- **Agregado `Vehicle`**: Modelagem de veículo da frota com placa normalizada única por tenant, capacidade física de assentos, recursos de acessibilidade (PCD), odômetro corrente e máquina de estados operacionais (`AVAILABLE`, `IN_MAINTENANCE`, `OUT_OF_SERVICE`).
- **Agregado `Driver`**: Qualificação operacional de condutor vinculada a `Person`, registro e categoria de CNH (B, C, D, E), data de validade da habilitação e ciclo de vida (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
- **Entidades de Conformidade Documental**: `VehicleDocument` e `DriverDocument` com controle de tipo de documento (CRLV, seguro, laudo, CNH, exame toxicológico), obrigatoriedade, data de emissão e expiração.
- **Motor de Elegibilidade Operacional (`EligibilityService`)**: Serviço de domínio que avalia em tempo de execução a elegibilidade conjunta de condutores e veículos para alocação, rejeitando categoricamente recursos com status divergente de `ACTIVE` ou com documentos obrigatórios expirados.
- **Módulo NestJS `FleetModule` e Expansão de `WorkforceModule`**: Repositórios PostgreSQL com concorrência otimista, serviços de aplicação com transações atômicas, eventos no Transactional Outbox e auditoria append-only em `audit.audit_records`.
- **API REST**: Endpoints REST em `VehicleController` e rotas de motoristas no `WorkforceController` validados com Zod e protegidos por autenticação e RBAC.

### Fora de Escopo

- Agendamento de viagens (`Trip`), paradas de embarque e roteirização (escopo do Milestone M4).
- Telemetria de rastreamento veicular em tempo real via GPS/IoT (escopo do Milestone M6).
- Módulo de abastecimento e custos de combustível (escopo de F19/M7).

## Capabilities

### New Capabilities
- `fleet/vehicle-driver-eligibility`: Gestão de veículos da frota, condutores habilitados, matriz de elegibilidade e conformidade regulatória de documentos com bloqueio de alocação de recursos inelegíveis.

### Modified Capabilities
*(Nenhuma capability existente tem requisitos modificados)*

## Impact

- **Código e Arquitetura**: Novo módulo backend `apps/api/src/modules/fleet` e expansão de `apps/api/src/modules/workforce`.
- **Banco de Dados**: Nova migration `infrastructure/migrations/0008_fleet_and_driver_eligibility.sql`.
- **Testes**: Suítes de testes unitários de domínio e testes de integração PostgreSQL validando o gate de inelegibilidade e isolamento RLS.
- **Conformidade**: Cumpre `data-model-plataforma-transporte.md` (Seções 10, 23, 28) e `implementation-plan-plataforma-transporte.md` (Milestone M2 Gate).
