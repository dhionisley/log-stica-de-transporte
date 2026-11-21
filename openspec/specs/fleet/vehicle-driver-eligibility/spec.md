# fleet/vehicle-driver-eligibility Specification

## Purpose
Define os contratos comportamentais para o cadastro de veículos da frota, condutores habilitados, controle de documentos de conformidade e o gate obrigatório de elegibilidade que impede a alocação de recursos inaptos.

## Requirements

### Requirement: Cadastro de Veículos e Placa Normalizada
O sistema SHALL permitir o cadastro e atualização de veículos da frota com código de frota, placa normalizada sem pontuação, tipo de veículo, capacidade de passageiros, recursos de acessibilidade e status operacional, garantindo unicidade por tenant.

#### Scenario: Cadastro válido de veículo
- **WHEN** um operador cadastra um veículo com código de frota único, placa válida e capacidade física de assentos positiva
- **THEN** o sistema cadastra o veículo com status `ACTIVE` e status operacional `AVAILABLE`, persistindo o registro com HTTP 201

#### Scenario: Rejeição de placa duplicada no mesmo tenant
- **WHEN** uma requisição submete uma placa já cadastrada para outro veículo do mesmo tenant
- **THEN** o sistema recusa o cadastro com erro de conflito HTTP 409

### Requirement: Cadastro de Motoristas e Habilitação CNH
O sistema SHALL permitir a qualificação de condutores associados a uma pessoa física, registrando número e categoria da CNH, validade da habilitação e ciclo de vida operacional (`ACTIVE`, `INACTIVE`, `SUSPENDED`).

#### Scenario: Qualificação de motorista com CNH válida
- **WHEN** um operador qualifica uma pessoa física cadastrada como motorista informando CNH válida, categoria (B/C/D/E) e data de vencimento futura
- **THEN** o sistema registra o motorista com status `ACTIVE` e associa a CNH ao cadastro correspondente

#### Scenario: Suspensão de motorista
- **WHEN** um operador suspende um motorista informando justificativa administrativa
- **THEN** o sistema altera o status do motorista para `SUSPENDED` e bloqueia sua disponibilidade operacional

### Requirement: Controle de Conformidade e Expiração de Documentos
O sistema SHALL permitir o registro de documentos obrigatórios de veículos (CRLV, seguro) e motoristas (CNH, toxicológico), rastreando a data limite de vigência e marcando documentos vencidos como expirados.

#### Scenario: Registro de documento regulatório
- **WHEN** um operador anexa um documento obrigatório a um veículo ou motorista com validade futura
- **THEN** o sistema persiste o documento com status `VALID` vinculado ao respectivo recurso

#### Scenario: Detecção de documento expirado
- **WHEN** um documento atinge ou ultrapassa a sua data de expiração
- **THEN** o sistema avalia o status do documento como `EXPIRED` e restringe a conformidade do recurso

### Requirement: Gate Mandatório de Elegibilidade de Veículos e Condutores
O sistema SHALL fornecer serviço de avaliação de elegibilidade que rejeita a alocação de motoristas ou veículos que estejam inativos, suspensos, com documentação mandatória vencida ou com CNH incompatível com o tipo de veículo.

#### Scenario: Bloqueio de alocação de motorista com CNH vencida
- **WHEN** é solicitada a verificação de elegibilidade de um motorista cuja CNH está vencida na data da operação
- **THEN** o sistema retorna inelegível com motivo explícito `DRIVER_LICENSE_EXPIRED` e impede a alocação

#### Scenario: Bloqueio de alocação de veículo em manutenção
- **WHEN** é solicitada a verificação de elegibilidade de um veículo com status operacional `IN_MAINTENANCE` ou `OUT_OF_SERVICE`
- **THEN** o sistema retorna inelegível com motivo `VEHICLE_NOT_AVAILABLE` e impede a alocação

#### Scenario: Alocação aprovada para recursos elegíveis
- **WHEN** motorista e veículo possuem status `ACTIVE`, documentação obrigatória em dia e categoria compatível com a viagem
- **THEN** o sistema retorna elegibilidade aprovada permitindo a escala do serviço

### Requirement: Emissão Confiável de Eventos e Auditoria Append-Only
O sistema SHALL publicar eventos no Transactional Outbox e registrar entradas imutáveis de auditoria para criação de veículos, motoristas, documentos e alterações de status operacional.

#### Scenario: Publicação atômica no Transactional Outbox e auditoria
- **WHEN** um veículo ou motorista tem seu status alterado ou documento registrado
- **THEN** o sistema grava o evento correspondente no outbox e a entrada em `audit.audit_records` na mesma transação de banco de dados
