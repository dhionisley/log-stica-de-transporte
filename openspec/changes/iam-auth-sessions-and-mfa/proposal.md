# Proposal: iam-auth-sessions-and-mfa

## Why

Com as capacidades de ciclo de vida de tenants (`platform/tenant-lifecycle`) e modelagem de usuários com RBAC contextual (`platform/iam-rbac`) concluídas e arquivadas no Milestone M1, o SaaS Control Plane necessita do mecanismo de autenticação segura de credenciais, gestão de sessões revogáveis e autenticação multifator (MFA). Conforme os requisitos de segurança da plataforma (`security-plataforma-transporte.md` e F02.01, F02.02, F02.05), perfis de alta autoridade (Admin e Supervisor) exigem obrigatoriamente MFA, e toda sessão deve ser revogável de forma imediata (com suporte a logout de dispositivo único ou global), impedindo o reaproveitamento de tokens vazados ou acessos residuais após desativação ou bloqueio.

## What Changes

- **Armazenamento Seguro de Credenciais**: Adição de persistência segura para senhas em `iam.user_credentials` (ou hash seguro `scrypt`/`argon2id` com salt criptográfico único por usuário), garantindo isolamento tenant-scoped e integridade referencial.
- **Autenticação e Desafio MFA**: Fluxo de autenticação verificando status do usuário e do tenant; caso o usuário possua `mfa_required = true` ou perfil privilegiado, a autenticação emite um ticket/desafio temporário de MFA até que o segundo fator seja validado com sucesso.
- **Gestão de Sessões Revogáveis**: Criação da tabela `iam.sessions` com isolamento RLS e chave estrangeira tenant-aware; emissão de Access Token JWT de curta duração (15 minutos) e Refresh Token opaco e rotacionável com rastreamento de uso e hash persistido.
- **Invalidação e Revogação Imediata via Redis + PostgreSQL**: Suporte a revogação de sessão individual, revogação por dispositivo e encerramento em massa de todas as sessões de um usuário; consulta ultrarrápida no Redis para bloqueio em tempo real sem sobrecarregar o banco relacional.
- **MFA com TOTP e Códigos de Recuperação**: Implementação de `iam.mfa_methods` para enrollment e validação de autenticação baseada em tempo (TOTP - RFC 6238) e códigos de backup com hashing seguro de recuperação.
- **Guards e Interceptors de Autenticação no NestJS**: Implementação de `JwtAuthGuard` tenant-aware que injeta a identidade validada e o contexto `app.tenant_id` no `RequestContextService`, além de verificar o status de revogação da sessão.
- **Eventos no Transactional Outbox e Auditoria**: Registro transacional atômico de eventos de autenticação (`UserAuthenticated`, `UserLoginFailed`, `SessionRevoked`, `MfaEnrolled`, `MfaChallengeVerified`) e trilha em `audit.audit_records`.

## Capabilities

### New Capabilities
- `platform/iam-auth-sessions`: Autenticação segura por senha, emissão e rotação de pares access/refresh token, sessões revogáveis persistidas em banco relacional e cache Redis, e validação de MFA (TOTP) com obrigatoriedade para perfis privilegiados.

### Modified Capabilities
- Nenhuma alteração de requisitos funcionais em specs existentes (`platform/iam-rbac` continua preservado e será consumido pelos guards e serviços de autorização).

## Impact

- **Banco de Dados**: Nova migration `infrastructure/migrations/0004_iam_auth_sessions.sql` com tabelas `iam.user_credentials`, `iam.sessions` e `iam.mfa_methods`, todas habilitadas para Row-Level Security (RLS) com policies estritas e FKs compostas `(tenant_id, user_id)`.
- **Módulo IAM**: Novos serviços de aplicação `AuthService`, `SessionService`, `MfaService` e repositórios em `apps/api/src/modules/iam/`.
- **Segurança e Guards**: `JwtAuthGuard` exportado ou registrado como guard padrão para rotas autenticadas da API, preservando compatibilidade com rotas públicas (`health/*`, `auth/login`, `auth/mfa/verify`).
- **Dependencies**: Utilização de bibliotecas seguras e consolidadas para tokens JWT (`@nestjs/jwt` ou nativo `jsonwebtoken`) e hashing/TOTP sem quebrar restrições de compatibilidade.
- **Fora de Escopo**: Provedores externos de SSO/SAML federado ou biometria WebAuthn física de hardware em nível de browser (serão plugados via ports/adapters em fases posteriores).
