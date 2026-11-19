# Proposal

## Why

A plataforma SaaS multitenant de transporte de pessoas necessita atender empresas contratantes (clientes corporativos) cujos colaboradores utilizam os serviços de transporte fretado ou sob demanda. 
Com a conclusão do Milestone M1 (Control Plane + IAM), o Milestone M2 estabelece o cadastro mestre operacional (*Operational Master Data*), cuja raiz mandatória é o cadastro, ciclo de vida e governança de empresas clientes (`ClientCompany`). Esta entidade é pré-requisito arquitetural indispensável para os vínculos empregatícios (`CompanyEmployment`), roteirização, contratos, faturamento corporativo e autorizações de passageiros.

## What Changes

- **Banco de Dados & Schema CRM**: Criação do schema `crm` e da tabela `crm.client_companies` com RLS obrigatório isolado por `tenant_id`, chave primária UUID e campos auditáveis (`created_at`, `updated_at`, `version`).
- **Agregado de Domínio `ClientCompany`**: Modelagem do agregado com máquina de estados de ciclo de vida (`ACTIVE`, `INACTIVE`, `BLOCKED`), validação de unicidade de documento fiscal (CNPJ/tax_id) por tenant, endereço de cobrança estruturado e lista de contatos operacionais/comerciais.
- **Módulo de Aplicação `ClientsModule`**: Criação do módulo modular em `apps/api/src/modules/clients` contendo interfaces de repositório, implementação PostgreSQL transacional (`ClientCompanyRepository`), e serviço de aplicação (`ClientCompanyManagementService`).
- **Mensageria Confiável & Auditoria**: Emissão atômica de eventos de integração no Transactional Outbox (`ClientCompanyCreated`, `ClientCompanyUpdated`, `ClientCompanyStatusChanged`) e registros imutáveis na tabela de auditoria (`platform.audit_logs`).
- **API REST & Governança**: Endpoints REST em `ClientCompanyController` (`POST /clients`, `GET /clients`, `GET /clients/:id`, `PATCH /clients/:id`, `POST /clients/:id/status`) protegidos por autenticação JWT, tenant resolution, RBAC (`clients:read`, `clients:write`, `clients:admin`) e esquemas estritos Zod.
- **Escopo de Privacidade de Empresa**: Estruturação de queries e invariantes para garantir que acessos restritos a uma empresa cliente específica não acessem dados de outras empresas clientes do mesmo locatário.

### Fora de Escopo

- Gestão de contratos financeiros e tabelas de preço (escopo de M3/M7).
- Vínculos individuais de funcionários (`CompanyEmployment`) e autorizações provisórias de passageiro (escopo do Incremento M2.2).
- Gestão de frotas e motoristas (escopo do Incremento M2.3).

## Capabilities

### New Capabilities
- `clients/client-companies`: Gestão do ciclo de vida cadastral, validação de unicidade de documento corporativo, dados de cobrança/contato e governança de privacidade de empresas clientes contratantes no modelo multitenant.

### Modified Capabilities
*(Nenhuma capability existente tem requisitos modificados)*

## Impact

- **Código e Arquitetura**: Novo módulo backend `apps/api/src/modules/clients` registrado no `AppModule` sem acoplamento a frameworks no domínio.
- **Banco de Dados**: Nova migration `infrastructure/migrations/0006_crm_client_companies.sql` compatível com o migration runner do projeto.
- **Testes**: Novas suítes de testes unitários de domínio e testes de integração PostgreSQL validando persistência, isolamento RLS e outbox.
- **Conformidade Arquitetural**: Cumpre integralmente os documentos `data-model-plataforma-transporte.md` (seção 8), `features-plataforma-transporte.md` (Épico F04) e `implementation-plan-plataforma-transporte.md` (Milestone M2).

