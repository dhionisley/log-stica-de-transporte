# Spec Delta

## Purpose

Define os requisitos comportamentais para identidade de usuários, catálogo global de permissões, perfis de permissão (RBAC) e autorização contextual tenant-scoped no SaaS Control Plane da plataforma.

## ADDED Requirements

### Requirement: Catálogo global e padronizado de permissões
O sistema MUST manter um catálogo global de permissões com chave primária alfanumérica (`code`), recurso associado e ação autorizada.

#### Scenario: Consulta a permissões disponíveis
- **WHEN** um operador consulta o catálogo de permissões da plataforma
- **THEN** o sistema retorna a lista completa de códigos padronizados (ex.: `tenant:settings:update`, `fleet:vehicle:read`) sem filtros de tenant

### Requirement: Isolamento tenant-scoped de Perfis de Permissão
O sistema MUST gerenciar perfis de permissão (`PermissionProfile`) garantindo que Tenant A não visualize, altere ou associe perfis pertencentes ao Tenant B via RLS.

#### Scenario: Criação de perfil em Tenant isolado
- **WHEN** um Tenant Admin cria um perfil de permissão customizado para seu tenant
- **THEN** o perfil e suas permissões associadas são persistidos com o `tenant_id` da sessão ativa e ficam inacessíveis a outros tenants

#### Scenario: Prevenção de associação cross-tenant
- **WHEN** uma requisição tenta associar um perfil de Tenant A a um usuário de Tenant B
- **THEN** a operação é rejeitada por violação de integridade referencial composta `(tenant_id, profile_id)`

### Requirement: Atribuição e resolução contextual de permissões de usuário
O sistema MUST permitir atribuir um ou mais perfis a um usuário e resolver com precisão se o usuário possui determinada permissão no contexto do tenant.

#### Scenario: Verificação positiva de permissão
- **WHEN** um usuário com perfil ativo associado à permissão `user:read` executa uma ação de consulta
- **THEN** o serviço de autorização confirma a permissão e autoriza a operação

#### Scenario: Usuário sem atribuição de perfil
- **WHEN** um usuário ativo sem perfis associados tenta executar uma ação protegida
- **THEN** o serviço de autorização nega o acesso por ausência de permissão

### Requirement: Atomicidade com Outbox e auditoria imutável
Toda alteração de perfis de permissão e atribuições de usuários MUST registrar auditoria imutável em `audit.audit_records` e evento correspondente no Transactional Outbox na mesma transação.

#### Scenario: Atribuição de perfil a usuário
- **WHEN** um perfil de acesso é atribuído a um usuário
- **THEN** a atribuição, o registro de auditoria e o evento `UserProfileAssigned` são confirmados atomicamente no banco
