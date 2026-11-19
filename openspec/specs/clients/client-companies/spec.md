# clients/client-companies Specification

## Purpose
Define os contratos comportamentais para o cadastro, governança de ciclo de vida, integridade de dados fiscais e isolamento de privacidade de empresas clientes contratantes (Client Companies).

## Requirements

### Requirement: Cadastro e Validação de Empresas Clientes
O sistema SHALL permitir o cadastro de empresas clientes com razão social, nome fantasia, documento fiscal (CNPJ/tax_id) formatado e validado, endereço de faturamento e contatos operacionais, garantindo unicidade do documento por tenant.

#### Scenario: Cadastro bem-sucedido de empresa cliente
- **WHEN** um operador com permissão `clients:write` submete dados válidos com razão social, nome fantasia e CNPJ único para o tenant atual
- **THEN** o sistema cadastra a empresa cliente com status inicial `ACTIVE`, gera um UUID primário e retorna HTTP 201 com os dados persistidos

#### Scenario: Rejeição de documento fiscal duplicado no mesmo tenant
- **WHEN** uma requisição de cadastro utiliza um CNPJ que já pertence a outra empresa cliente ativa ou inativa no mesmo tenant
- **THEN** o sistema rejeita a operação com erro de conflito HTTP 409 e impede a persistência

### Requirement: Máquina de Estados e Ciclo de Vida da Empresa Cliente
O sistema SHALL governar as transições de status da empresa cliente entre ACTIVE, INACTIVE e BLOCKED, restringindo modificações operacionais quando em estado bloqueado ou inativo.

#### Scenario: Bloqueio administrativo de empresa cliente
- **WHEN** um operador com permissão `clients:admin` altera o status de uma empresa cliente de `ACTIVE` para `BLOCKED` com justificativa
- **THEN** o sistema atualiza o status para `BLOCKED`, registra a transição e impede que novos agendamentos ou vínculos sejam aceitos para essa empresa

#### Scenario: Reativação de empresa cliente
- **WHEN** um operador com permissão `clients:admin` altera o status de `BLOCKED` ou `INACTIVE` para `ACTIVE`
- **THEN** o sistema restaura o status da empresa para `ACTIVE` e restabelece a capacidade de operar normalmente

### Requirement: Isolamento Multitenant e Políticas de Acesso de Dados
O sistema SHALL assegurar isolamento estrito via Row-Level Security no schema `crm`, garantindo que requisições vinculadas a um tenant nunca leiam ou modifiquem dados de empresas de outro tenant.

#### Scenario: Tentativa de acesso cross-tenant
- **WHEN** um usuário autenticado no Tenant A tenta consultar ou alterar uma empresa cliente pertencente ao Tenant B
- **THEN** o sistema não retorna registros (HTTP 404) ou rejeita a operação sem expor metadados ou existência do recurso em outro tenant

#### Scenario: Escopo de privacidade comercial
- **WHEN** um usuário comercial restrito a uma empresa cliente específica consulta a listagem de clientes
- **THEN** o sistema retorna apenas a empresa cliente à qual o usuário possui vínculo comercial explícito

### Requirement: Emissão Confiável de Eventos de Domínio e Auditoria
O sistema SHALL publicar eventos no Transactional Outbox e registrar entradas na tabela de auditoria para toda criação, modificação de dados cadastrais e transição de status de empresas clientes.

#### Scenario: Emissão atômica no Transactional Outbox
- **WHEN** uma empresa cliente é cadastrada ou tem seu status alterado
- **THEN** o sistema grava o evento correspondente (`ClientCompanyCreated` ou `ClientCompanyStatusChanged`) na tabela de outbox na mesma transação de banco de dados

#### Scenario: Registro append-only de auditoria
- **WHEN** qualquer alteração cadastral ou de status de empresa cliente é efetivada
- **THEN** uma entrada de auditoria imutável contendo o autor, timestamp, estado anterior e novo estado é gravada em `platform.audit_logs`
