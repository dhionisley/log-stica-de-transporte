# platform/plans-entitlements Specification

## Purpose
Gerenciar o catálogo global de planos comerciais, funcionalidades e limites operacionais, com controle transacional de assinaturas de transportadoras e validação server-side de entitlements em tempo de execução no SaaS Control Plane.

## Requirements

### Requirement: Catálogo Global de Planos e Configuração de Limites
O sistema DEVE (SHALL) manter catálogo global de planos comerciais com código único e imutável, status e conjunto associado de funcionalidades booleanas e limites quantitativos tipados.

#### Scenario: Consulta de catálogo público de planos
- **WHEN** um usuário ou cliente consulta os planos comerciais disponíveis no catálogo da plataforma
- **THEN** o sistema retorna todos os planos ativos com suas respectivas funcionalidades e limites estruturados em formato JSON

#### Scenario: Cadastro ou atualização de plano no catálogo
- **WHEN** um administrador do SaaS Control Plane cadastra um novo plano com seus limites operacionais
- **THEN** o sistema persiste o plano e suas features de forma atômica no schema `platform` e emite evento no Transactional Outbox

### Requirement: Gestão de Assinaturas Tenant-Scoped
O sistema DEVE (SHALL) associar cada transportadora a uma assinatura vigente em `platform.subscriptions`, registrando data de início, término opcional, status da assinatura e eventuais limites customizados negociados.

#### Scenario: Ativação inicial de assinatura para novo tenant
- **WHEN** um tenant é provisionado ou ativado na plataforma com um plano selecionado
- **THEN** o sistema cria um registro de assinatura com status `ACTIVE`, data de vigência e herda as features e limites definidos no plano base

#### Scenario: Mudança de plano com upgrade ou downgrade
- **WHEN** o administrador solicita alteração do plano associado à assinatura do tenant
- **THEN** o sistema atualiza a assinatura de forma transacional, recalcula os limites efetivos, registra a transição na trilha de auditoria e emite `PlanChanged` no Outbox

#### Scenario: Aplicação de limites customizados para transportadora
- **WHEN** é concedido um limite customizado em contrato para um tenant específico que sobrepõe o limite padrão do plano
- **THEN** o sistema armazena a sobreposição em `custom_limits` e passa a considerá-lo prioritariamente na resolução de entitlements

### Requirement: Resolução e Validação de Entitlements em Tempo de Execução
O sistema DEVE (SHALL) resolver os direitos de acesso do tenant combinando as features do plano e eventuais sobreposições customizadas, bloqueando operações excedentes com código semântico padronizado.

#### Scenario: Tenant tenta acessar funcionalidade não contratada
- **WHEN** uma requisição operacional aciona endpoint ou comando protegido por uma feature booleana desabilitada no plano do tenant
- **THEN** o sistema rejeita a operação com status HTTP 403 e código `FEATURE_NOT_IN_PLAN`

#### Scenario: Operação respeita o limite quantitativo contratado
- **WHEN** o tenant executa uma ação de cadastro de recurso dentro da quantidade permitida pelo limite contratado
- **THEN** o sistema autoriza a operação e prossegue com a execução do comando

#### Scenario: Tenant tenta exceder o limite quantitativo contratado
- **WHEN** uma tentativa de criação de recurso novo supera o limite numérico vigente da assinatura
- **THEN** o sistema bloqueia a transação com status HTTP 422 e código `PLAN_LIMIT_EXCEEDED` sem alterar os dados persistidos

### Requirement: Isolamento Multitenant de Assinaturas
O sistema DEVE (SHALL) isolar os registros de assinaturas e limites customizados através de Row-Level Security (RLS) baseado em `app.tenant_id`, impedindo que um tenant visualize ou altere a assinatura de outro.

#### Scenario: Tentativa de consulta cruzada de assinatura
- **WHEN** uma sessão autenticada sob o Tenant A tenta ler ou consultar a assinatura pertencente ao Tenant B
- **THEN** a camada de isolamento RLS e o repositório omitem os dados do Tenant B retornando vazio ou HTTP 404
