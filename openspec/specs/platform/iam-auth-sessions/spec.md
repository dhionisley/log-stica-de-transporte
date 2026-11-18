# platform/iam-auth-sessions Specification

## Purpose
Fornecer autenticação segura de credenciais, emissão e rotação de pares access e refresh token com sessões revogáveis persistidas em banco relacional e cache Redis, além de verificação obrigatória de autenticação multifator (MFA TOTP) para papéis privilegiados no SaaS Control Plane.

## Requirements

### Requirement: Autenticação Segura por Senha e Verificação de Credenciais
O sistema DEVE (SHALL) autenticar credenciais de usuários comparando o identificador (e-mail normalizado) e a senha contra o hash criptográfico protegido, validando simultaneamente o status ativo do usuário e do tenant contratante.

#### Scenario: Autenticação com credenciais válidas e usuário sem MFA
- **WHEN** um usuário ativo de um tenant ativo fornece e-mail e senha corretos e não possui MFA obrigatório ou configurado
- **THEN** o sistema autentica com sucesso, cria uma nova sessão ativa e retorna um par de access token JWT e refresh token opaco com status HTTP 200

#### Scenario: Tentativa com credenciais inválidas
- **WHEN** são fornecidos e-mail ou senha incorretos para autenticação
- **THEN** o sistema rejeita a autenticação com HTTP 401, registra a falha na trilha de auditoria e incrementa contador de tentativas falhas sem revelar se o e-mail existe

#### Scenario: Tentativa em tenant ou usuário suspenso
- **WHEN** as credenciais pertencem a um usuário com status inativo ou cujo tenant está suspenso ou finalizado
- **THEN** o sistema rejeita a autenticação com HTTP 403 proibindo o acesso operacional

### Requirement: Desafio e Verificação de Autenticação Multifator (MFA)
O sistema DEVE (SHALL) exigir desafio de segundo fator (TOTP) para qualquer usuário com flag `mfa_required` ativada ou detentor de perfil de alta autoridade (Admin ou Supervisor), emitindo ticket temporário restrito até a validação do código.

#### Scenario: Usuário com MFA obrigatório realiza primeiro passo do login
- **WHEN** um usuário com MFA exigido informa credenciais válidas de senha
- **THEN** o sistema NÃO emite a sessão completa nem access token de recursos, retornando HTTP 200 com status `MFA_REQUIRED` e um ticket efêmero assinado para validação do segundo fator

#### Scenario: Conclusão bem-sucedida do desafio MFA
- **WHEN** o usuário fornece o ticket temporário válido acompanhado do código TOTP correto de 6 dígitos dentro da janela de tolerância de tempo
- **THEN** o sistema valida o método, registra a sessão ativa, emite os tokens finais de acesso e refresh e registra o evento de sucesso no Transactional Outbox

#### Scenario: Código MFA incorreto ou expirado
- **WHEN** o usuário submete um código TOTP divergente ou um ticket expirado
- **THEN** o sistema recusa a emissão dos tokens com HTTP 401 e audita a tentativa inválida de MFA

### Requirement: Gestão de Sessões Revogáveis e Rotação de Tokens
O sistema DEVE (SHALL) persistir sessões ativas no banco relacional `iam.sessions` e manter chaves de validação em Redis, suportando rotação segura de refresh token e revogação imediata por sessão ou global por usuário.

#### Scenario: Renovação de tokens com rotação de refresh token
- **WHEN** o cliente apresenta um refresh token válido associado a uma sessão ativa e não revogada
- **THEN** o sistema emite um novo access token de curta duração, rotaciona o refresh token invalidando o anterior e atualiza o timestamp `last_seen_at` da sessão

#### Scenario: Revogação explícita de sessão (Logout)
- **WHEN** o usuário ou administrador solicita a revogação de uma sessão ativa informando o identificador da sessão
- **THEN** o sistema marca a sessão como revogada (`revoked_at`), remove a chave correspondente do Redis e rejeita imediatamente quaisquer requisições subsequentes usando os tokens dessa sessão

#### Scenario: Tentativa de reaproveitamento de refresh token antigo
- **WHEN** uma requisição apresenta um refresh token que já foi rotacionado ou invalidado
- **THEN** o sistema detecta suspeita de comprometimento, revoga preventivamente toda a árvore de sessões do dispositivo e audita o alerta de segurança

### Requirement: Guard de Autenticação e Contexto de Tenant
O sistema DEVE (SHALL) interceptar requisições protegidas via `JwtAuthGuard`, validando a assinatura do token, a expiração, o status de não revogação no Redis/banco e vinculando a identidade e o `app.tenant_id` no contexto de execução.

#### Scenario: Requisição com access token válido e sessão ativa
- **WHEN** uma chamada a endpoint restrito traz um header `Authorization: Bearer <token>` íntegro e a sessão está ativa no Redis
- **THEN** o guard permite a execução, injeta o usuário autenticado e define o `app.tenant_id` para cumprimento estrito de isolamento e RLS

#### Scenario: Requisição com token de sessão previamente revogada
- **WHEN** uma chamada utiliza um access token cuja assinatura é válida mas a sessão consta como revogada no Redis
- **THEN** o guard rejeita a requisição imediatamente com HTTP 401 sem acessar os serviços de domínio ou persistência
