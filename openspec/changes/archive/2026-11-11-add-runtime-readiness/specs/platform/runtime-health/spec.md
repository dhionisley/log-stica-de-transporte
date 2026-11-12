# Spec Delta

## Purpose

Garante que a API valide sua configuração e somente seja considerada pronta quando suas dependências operacionais essenciais estiverem disponíveis.

## ADDED Requirements

### Requirement: Configuração obrigatória validada
A API MUST recusar a inicialização quando uma configuração obrigatória estiver ausente ou inválida.

#### Scenario: Configuração válida
- **WHEN** todas as configurações obrigatórias possuem valores válidos
- **THEN** a validação permite que a inicialização continue

#### Scenario: Configuração inválida
- **WHEN** uma configuração obrigatória está ausente ou possui formato inválido
- **THEN** a inicialização falha com uma mensagem que identifica os campos inválidos sem revelar segredos

### Requirement: Liveness independente
O endpoint de liveness SHALL informar se o processo da API está em execução sem depender da disponibilidade de PostgreSQL ou Redis.

#### Scenario: Processo em execução
- **WHEN** o processo atende `GET /internal/api/v1/health/live`
- **THEN** a resposta possui HTTP 200 e estado `ok`

### Requirement: Readiness verifica dependências essenciais
O endpoint de readiness MUST verificar PostgreSQL e Redis antes de declarar a instância pronta para receber tráfego.

#### Scenario: Todas as dependências disponíveis
- **WHEN** PostgreSQL responde à consulta de saúde e Redis responde ao ping
- **THEN** `GET /internal/api/v1/health/ready` responde HTTP 200, estado `ready` e identifica ambas as dependências como disponíveis

#### Scenario: PostgreSQL indisponível
- **WHEN** PostgreSQL não responde à verificação de saúde
- **THEN** o endpoint responde HTTP 503, estado `not_ready` e identifica PostgreSQL como indisponível

#### Scenario: Redis indisponível
- **WHEN** Redis não responde à verificação de saúde
- **THEN** o endpoint responde HTTP 503, estado `not_ready` e identifica Redis como indisponível

### Requirement: Encerramento libera conexões
A API MUST encerrar seus clients PostgreSQL e Redis durante o shutdown para não manter conexões órfãs.

#### Scenario: Shutdown da aplicação
- **WHEN** a aplicação recebe o evento de encerramento
- **THEN** os clients PostgreSQL e Redis são finalizados de forma controlada
