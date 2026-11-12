# platform/ci-quality-gates Specification

## Purpose
Garante que build, lint, testes unitários e de integração, migration e verificações de segurança rodem automaticamente antes de qualquer integração na `main`.

## Requirements

### Requirement: Instalação reproduzível
O pipeline MUST instalar dependências com lockfile congelado e falhar quando o lockfile estiver desatualizado.

#### Scenario: Lockfile divergente
- **WHEN** `package.json` e `pnpm-lock.yaml` estão inconsistentes
- **THEN** a etapa de instalação falha e o pipeline não prossegue

### Requirement: Lint obrigatório
O pipeline MUST executar lint sobre o código da API e falhar quando houver violações de erro.

#### Scenario: Violação de lint
- **WHEN** o código contém violação classificada como erro
- **THEN** o job de lint falha

### Requirement: Integração com banco real
O pipeline SHALL aplicar a migration em um PostgreSQL/PostGIS limpo e executar os testes de integração, incluindo isolamento entre tenants, Outbox e Inbox.

#### Scenario: Banco limpo no CI
- **WHEN** o job de integração inicia
- **THEN** a migration é aplicada em banco vazio e os testes de integração são executados contra ele

#### Scenario: Regressão de isolamento
- **WHEN** um teste de isolamento Tenant A/Tenant B falha
- **THEN** o pipeline falha

### Requirement: Verificações de segurança
O pipeline MUST executar SCA, secret scan e SAST e falhar quando encontrar achados acima do limite definido.

#### Scenario: Dependência vulnerável
- **WHEN** o SCA encontra vulnerabilidade com severidade igual ou superior ao limite
- **THEN** o job de segurança falha

#### Scenario: Segredo no repositório
- **WHEN** o secret scan detecta credencial commitada
- **THEN** o job falha sem expor o valor detectado nos logs
