# Spec Delta

## Purpose

Define os contratos comportamentais para o cadastro canônico de pessoas físicas, colaboradores, múltiplos vínculos empregatícios com empresas clientes contratantes e autorizações provisórias de passageiros em ambiente multilocatário.

## ADDED Requirements

### Requirement: Cadastro de Pessoa Física e Validação de Documento
O sistema SHALL permitir o cadastro e atualização de pessoas físicas (`Person`) com nome completo, nome social opcional, contatos e documento fiscal (CPF) validado pelo algoritmo oficial, assegurando unicidade por tenant.

#### Scenario: Cadastro válido de pessoa física
- **WHEN** um operador autenticado submete dados de uma pessoa com nome completo e CPF válido não cadastrado previamente no tenant atual
- **THEN** o sistema cadastra a pessoa com status `ACTIVE`, gera UUID primário e retorna HTTP 201 com os dados persistidos

#### Scenario: Rejeição de CPF duplicado no mesmo tenant
- **WHEN** uma requisição de cadastro submete um CPF que já pertence a outra pessoa cadastrada no mesmo tenant
- **THEN** o sistema recusa a operação com erro de conflito HTTP 409 e impede a duplicação

### Requirement: Qualificação e Ciclo de Vida de Colaboradores
O sistema SHALL permitir a qualificação de uma pessoa como colaborador (`Employee`) no tenant, governando seu status operacional (`ACTIVE`, `INACTIVE`, `SUSPENDED`) e vínculo de conta na plataforma (`LINKED`/`UNLINKED`).

#### Scenario: Qualificação de pessoa como colaborador
- **WHEN** um operador qualifica uma pessoa física existente como colaborador do tenant
- **THEN** o sistema cria o registro de `Employee` com status inicial `ACTIVE`, status de conta `UNLINKED` e associa à pessoa correspondente

#### Scenario: Suspensão operacional de colaborador
- **WHEN** um operador com permissão administrativa suspende um colaborador informando o motivo da suspensão
- **THEN** o sistema altera o status do colaborador para `SUSPENDED`, registrando a justificativa e impedindo novas alocações em viagens

### Requirement: Vínculos Corporativos Multi-Company e Isolamento de Privacidade
O sistema SHALL permitir que um colaborador possua múltiplos vínculos com empresas clientes contratantes simultâneas, assegurando que cada empresa cliente visualize apenas seus próprios vínculos, sem vazamento de vínculos com outras empresas.

#### Scenario: Colaborador com múltiplos vínculos em empresas clientes distintas
- **WHEN** um operador associa o mesmo colaborador à Empresa Cliente A e à Empresa Cliente B com códigos de matrícula distintos
- **THEN** o sistema persiste ambos os vínculos com suas respectivas vigências temporais (`valid_from`/`valid_to`) e status independentes

#### Scenario: Isolamento de visualização entre empresas clientes
- **WHEN** um usuário comercial da Empresa Cliente A consulta os colaboradores e vínculos
- **THEN** o sistema retorna exclusivamente os vínculos associados à Empresa Cliente A, omitindo qualquer menção ao vínculo do colaborador com a Empresa Cliente B

### Requirement: Autorização Provisória de Passageiro
O sistema SHALL permitir a emissão e revogação de autorizações provisórias de transporte para colaboradores ou passageiros temporários, delimitadas por período de vigência e motivo operacional.

#### Scenario: Emissão de autorização provisória de transporte
- **WHEN** um operador concede uma autorização provisória de transporte para um colaborador em determinada empresa cliente com data de início e término válidas
- **THEN** o sistema gera a autorização com status `ACTIVE`, registrando o usuário aprovador e o intervalo de vigência

#### Scenario: Revogação de autorização provisória
- **WHEN** um operador revoga uma autorização provisória ativa com justificativa
- **THEN** o sistema atualiza o status para `REVOKED` e encerra a validade operacional imediatamente

### Requirement: Publicação de Eventos e Auditoria Append-Only
O sistema SHALL publicar eventos no Transactional Outbox e registrar histórico imutável na tabela de auditoria para toda criação e alteração cadastral de pessoas, colaboradores, vínculos empregatícios e autorizações.

#### Scenario: Registro atômico no Transactional Outbox e auditoria
- **WHEN** um vínculo empregatício ou autorização provisória é criado ou atualizado
- **THEN** o sistema grava o evento correspondente no outbox e a entrada na tabela `audit.audit_records` dentro da mesma transação de banco de dados
