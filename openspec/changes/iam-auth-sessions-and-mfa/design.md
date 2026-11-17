# Design: iam-auth-sessions-and-mfa

## Context

A plataforma SaaS multitenant de transporte de pessoas já possui os agregados de Tenants (`platform.tenants`), configurações/branding, e usuários com perfis e permissões (`iam.users`, `iam.permission_profiles`, `iam.user_profile_assignments`) isolados com RLS. Para completar os requisitos fundamentais de identidade do Milestone M1 (F02.01, F02.02, F02.05 e `security-plataforma-transporte.md`), é necessário prover autenticação de credenciais, emissão e rotação de tokens de sessão e verificação de segundo fator (MFA) obrigatória para papéis administrativos.

## Goals / Non-Goals

**Goals:**
- Armazenamento de senhas seguro e resistente a força bruta utilizando `scrypt` com salt individual por usuário.
- Emissão de pares de tokens: Access Token JWT de curta duração (15 min) e Refresh Token opaco e rotacionável com rastreamento de cadeia.
- Persistência e isolamento RLS de sessões em `iam.sessions` com chave estrangeira composta tenant-aware `(tenant_id, user_id)`.
- Verificação instantânea de revogação de sessão via Redis com TTL sincronizado à expiração do refresh token.
- Implementação de autenticação multifator (MFA) baseada em TOTP (RFC 6238) e códigos de backup para recuperação de emergência, com obrigatoriedade estrita para usuários Admin e Supervisor.
- Proteção da API através de `JwtAuthGuard` tenant-aware que propaga a identidade autenticada e o contexto `app.tenant_id` para o `RequestContextService`.
- Emissão atômica de eventos de segurança no Transactional Outbox e registro em `audit.audit_records`.

**Non-Goals:**
- Provedores externos de federação corporativa SSO/SAML 2.0 ou OIDC social (fase posterior via ports/adapters).
- WebAuthn com chaves físicas FIDO2 de hardware no browser neste incremento (focado inicialmente em TOTP + códigos de backup).
- Rate-limiting avançado de edge ou WAF contra credential stuffing (será implementado no API Gateway/WAF da infraestrutura).

## Decisions

### 1. Hashing de Senhas com `scrypt` (`node:crypto`)
- **Decisão**: Utilizar o algoritmo padrão moderno `scrypt` disponível nativamente em `node:crypto` com salt criptográfico de 16 bytes e parâmetros de custo calibrados (N=16384, r=8, p=1).
- **Justificativa**: Evita dependências binárias nativas em C++ (como node-gyp com bcrypt antigo ou argon2) que podem causar incompatibilidades entre Windows e os runners do GitHub Actions (Ubuntu), mantendo resistência robusta contra ataques em hardware paralelo/GPU.
- **Alternativas consideradas**: `bcrypt` (dependência externa compilada com limitações de tamanho de senha de 72 bytes) e `argon2` (exige módulos nativos compilados que falham com frequência em ambientes CI heterogêneos).

### 2. Gestão de Sessões em Duas Camadas (PostgreSQL + Redis)
- **Decisão**: Toda sessão criada é registrada em `iam.sessions` com status, timestamps, metadados de dispositivo e hash SHA-256 do refresh token atual. Simultaneamente, uma chave leve `iam:session:<session_id>` é gravada no Redis com TTL correspondente à vida útil da sessão.
- **Justificativa**: Permite que o `JwtAuthGuard` verifique a validade e não-revogação da sessão em sub-milissegundo no Redis sem disparar consultas constantes ao banco relacional em cada chamada HTTP, ao mesmo tempo que mantém auditoria histórica e integridade referencial no PostgreSQL.
- **Revogação**: No logout ou bloqueio administrativo, a chave do Redis é imediatamente excluída e a linha no PostgreSQL é marcada como `revoked_at = now()`.

### 3. Rotação de Refresh Token e Detecção de Reuso
- **Decisão**: A cada renovação de sessão via `/internal/api/v1/auth/refresh`, o refresh token anterior é invalidado e um novo é emitido. Caso um refresh token já consumido seja reapresentado, o sistema detecta tentativa de reuso malicioso e revoga preventivamente toda a árvore de sessões do dispositivo/usuário.
- **Justificativa**: Mitigação padrão recomendada pelo OAuth 2.0 Security Best Current Practice contra vazamentos de refresh token.

### 4. MFA via TOTP (RFC 6238) e Encriptação de Segredo em Repouso
- **Decisão**: Implementar gerador e validador TOTP padrão (HMAC-SHA1, 6 dígitos, intervalo de 30s com janela de tolerância de ±1 período para desvios de relógio). O segredo base do TOTP é criptografado antes de ser salvo no banco em `iam.mfa_methods.secret_encrypted` usando AES-256-GCM com chave derivada das variáveis de ambiente de segurança.
- **Justificativa**: Impede vazamento do segredo de segundo fator caso haja dump de banco ou acesso não autorizado à tabela.

### 5. Integração com Guards e `RequestContextService`
- **Decisão**: O `JwtAuthGuard` extrai o token do header `Authorization: Bearer <token>`, valida a assinatura com chave secreta, extrai o payload `{ sub, tenant_id, session_id, roles }`, checa a validade da sessão no Redis e atualiza o `RequestContextService` com `tenantId`, `userId` e `sessionId`.
- **Justificativa**: Mantém desacoplamento total entre HTTP/NestJS e as regras de domínio/repositórios que apenas recebem o contexto transacional `app.tenant_id`.

## Risks / Trade-offs

- **[Risco] Indisponibilidade do Redis impactar verificação de sessões**:
  → *Mitigação*: Caso o Redis esteja temporariamente indisponível, o guard faz fallback seguro consultando `iam.sessions` no PostgreSQL, garantindo alta disponibilidade sem quebrar segurança.
- **[Risco] Bloqueio indevido de usuários em caso de perda de dispositivo MFA**:
  → *Mitigação*: Geração de lista de códigos de backup (hashes com salt) durante o enrollment de MFA, permitindo acesso de contingência auditado e redefinição de método por Admin.
- **[Risco] Desvio de relógio entre cliente e servidor em TOTP**:
  → *Mitigação*: Aceitação de janela temporal de ±1 step (30 segundos antes e depois), cobrindo variações comuns de relógio de smartphones.

## Migration Plan

1. Executar a migration `0004_iam_auth_sessions.sql` criando `iam.user_credentials`, `iam.sessions` e `iam.mfa_methods` com RLS habilitado e policies isolando por `app.tenant_id`.
2. As tabelas existentes permanecem intocadas de forma backward-compatible; usuários criados sem credenciais continuam válidos no modelo, permitindo provisionamento progressivo de senhas.
3. Rollback: caso necessário, remoção das tabelas criadas pela migration 0004 sem afetar `iam.users` ou `iam.permission_profiles`.

