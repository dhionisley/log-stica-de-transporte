# Design

## Context

Com as entregas dos incrementos M2.1 (`client-companies-master-data`) e M2.2 (`people-and-workforce-master-data`), o cadastro corporativo e de colaboradores está estabelecido.
O Incremento M2.3 institui os recursos de execução do transporte: veículos da frota (`fleet.vehicles`), condutores habilitados (`workforce.drivers`), matriz de elegibilidade (`workforce.driver_eligibilities`) e documentos de conformidade (`compliance documents`), satisfazendo o gate mandatório do Milestone M2: recursos inelegíveis não podem ser alocados.

## Goals / Non-Goals

**Goals:**
- Criar o schema `fleet` e as tabelas `fleet.vehicles` e `fleet.vehicle_documents` com RLS obrigatório via `app.tenant_id`.
- Criar as tabelas `workforce.drivers`, `workforce.driver_eligibilities` e `workforce.driver_documents` com RLS via `app.tenant_id`.
- Modelar o agregado `Vehicle` com placa normalizada única por tenant, capacidade física de passageiros, recursos de acessibilidade e ciclo de vida operacional (`AVAILABLE`, `IN_MAINTENANCE`, `OUT_OF_SERVICE`).
- Modelar o agregado `Driver` associado a `Person`, com controle de CNH (categoria e vencimento) e ciclo de vida (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
- Modelar documentos de conformidade regulatória com controle de datas de expiração e obrigatoriedade.
- Implementar o motor de domínio `EligibilityService` para atestar a elegibilidade operacional de condutores e veículos em tempo de execução.
- Garantir concorrência otimista via coluna `version` em todas as tabelas.
- Orquestrar operações de aplicação com emissão de eventos no Transactional Outbox e auditoria append-only em `audit.audit_records`.
- Expor API REST com endpoints validados via Zod.

**Non-Goals:**
- Agendamento de viagens (`Trip`), paradas de embarque e alocações operacionais (escopo do Milestone M4).
- Telemetria de rastreamento veicular em tempo real (escopo do Milestone M6).

## Decisions

### 1. Separação de Tabelas de Documentos de Veículo e Motorista
- **Decisão**: Utilizar `fleet.vehicle_documents` e `workforce.driver_documents` em vez de uma tabela polimórfica única.
- **Racional**: Cumpre a recomendação V1 da Seção 28 de `data-model-plataforma-transporte.md`, assegurando integridade referencial física estrita via chaves estrangeiras compostas tenant-aware, sem perder tipagem nem criar campos nulos desnecessários.

### 2. Normalização de Placas Veiculares
- **Decisão**: Armazenamento na coluna `plate_normalized` sem pontuação, espaços ou caracteres especiais, sempre em maiúsculas (ex: "ABC1D23" para Mercosul ou "ABC1234" para padrão anterior). A unicidade é garantida pela constraint `UNIQUE (tenant_id, plate_normalized)`.

### 3. Matriz de Elegibilidade e Validação de CNH
- **Decisão**: A avaliação de elegibilidade (`EligibilityService`) verifica:
  1. Status do condutor (`ACTIVE`);
  2. Data de validade da CNH (`license_expires_at >= atDate`);
  3. Compatibilidade da categoria da CNH com o tipo de veículo (categoria B para carros, D/E para vans, micro-ônibus e ônibus);
  4. Vigência de documentos mandatórios do motorista;
  5. Status do veículo (`ACTIVE` e `AVAILABLE`);
  6. Vigência de documentos mandatórios do veículo (CRLV, seguro).
- Recursos com qualquer pendência são marcados como inelegíveis com código de motivo detalhado.

### 4. Arquitetura Modular
- Novo módulo `apps/api/src/modules/fleet/`:
  - `domain/`: agregado `Vehicle`, entidade `VehicleDocument`, tipos e interface `IVehicleRepository`.
  - `infrastructure/`: `PostgresVehicleRepository`.
  - `application/`: `VehicleManagementService`, `EligibilityService`.
  - `controllers/`: `VehicleController`.
- Expansão de `apps/api/src/modules/workforce/` para condutores (`Driver`, `DriverDocument`, `DriverEligibility`).

## Risks / Trade-offs

- **[Risco] Alocação indevida de motorista com CNH vencida ou veículo sem seguro**:
  → *Mitigação*: Motor `EligibilityService` centralizado, invocado no planejamento e verificado por testes de integração de gate.
- **[Risco] Concorrência em atualizações de status ou hodômetro**:
  → *Mitigação*: Controle de concorrência otimista via coluna `version`.

## Migration Plan

1. Criar migration `infrastructure/migrations/0008_fleet_and_driver_eligibility.sql`.
2. Execução via `migration-runner` idempotente.
