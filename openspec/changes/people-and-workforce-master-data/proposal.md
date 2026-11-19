# Proposal

## Why

A plataforma SaaS de transporte de pessoas gerencia a mobilidade corporativa de colaboradores vinculados a empresas contratantes.
Com a consolidação do cadastro de empresas clientes no Incremento M2.1, é indispensável estruturar o cadastro mestre das pessoas físicas (`Person`), a qualificação de colaboradores (`Employee`), seus vínculos empregatícios temporais (`CompanyEmployment`) e as autorizações de embarque provisórias (`ProvisionalTransportAuthorization`).
Esta base viabiliza o agendamento de serviços de transporte (M3) e o planejamento de viagens (M4), assegurando que colaboradores possam ter múltiplos vínculos simultâneos sem qualquer vazamento de contexto ou dados entre empresas clientes concorrentes.

## What Changes

- **Banco de Dados & Schema Workforce**: Criação do schema `workforce` e tabelas `workforce.people`, `workforce.employees`, `workforce.company_employments` e `workforce.provisional_transport_authorizations` com RLS obrigatório via `app.tenant_id` e integridade referencial tenant-aware composta.
- **Agregado `Person`**: Modelagem de pessoa física com validação estrita de CPF (dígitos verificadores da RFB), dados de contato normalizados e controle de unicidade por locatário.
- **Agregado `Employee`**: Qualificação operacional de funcionário vinculada à `Person`, com controle de estado de conta (`LINKED`/`UNLINKED`) e ciclo de vida (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
- **Agregado / Entidade `CompanyEmployment`**: Vínculos empregatícios temporais associando colaboradores às empresas clientes contratantes (`client_company_id`), código externo/matrícula, vigência temporal (`valid_from`/`valid_to`), garantindo a regra de governança: uma empresa cliente só pode visualizar seus próprios vínculos.
- **Autorizações Provisórias de Passageiro (`ProvisionalTransportAuthorization`)**: Suporte a autorizações de embarque temporárias com vigência explícita, aprovador e motivo.
- **Módulo de Aplicação `WorkforceModule`**: Módulo NestJS em `apps/api/src/modules/workforce` contendo interfaces de domínio, repositórios PostgreSQL com suporte a concorrência otimista via coluna `version`, serviço de gestão orquestrado por `TenantTransactionHelper`, publicação confiável de eventos no Transactional Outbox e auditoria imutável.
- **API REST**: Endpoints REST em `WorkforceController` validados com Zod e protegidos por autenticação e RBAC.

### Fora de Escopo

- Cadastro de motoristas (`workforce.drivers`), elegibilidade de condutores e frotas de veículos (escopo do Incremento M2.3).
- Agendamento de serviços de transporte (`WorkService`) e detecção de conflitos de horário (escopo do Milestone M3).

## Capabilities

### New Capabilities
- `workforce/people-and-employment`: Gestão de pessoas físicas, colaboradores, múltiplos vínculos corporativos temporais com isolamento estrito de visibilidade entre empresas clientes e autorizações provisórias de passageiros.

### Modified Capabilities
*(Nenhuma capability existente tem requisitos modificados)*

## Impact

- **Código e Arquitetura**: Novo módulo backend `apps/api/src/modules/workforce` registrado em `AppModule`.
- **Banco de Dados**: Nova migration `infrastructure/migrations/0007_workforce_people_and_employment.sql`.
- **Testes**: Novas suítes de testes unitários de domínio/aplicação e testes de integração PostgreSQL cobrindo multitenancy, concorrência e o isolamento multi-company de colaboradores.
- **Conformidade**: Cumpre `data-model-plataforma-transporte.md` (Seção 10), `domain-model-plataforma-transporte.md` e `implementation-plan-plataforma-transporte.md` (Milestone M2).
