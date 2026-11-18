# Tasks

## 1. Banco de Dados e Migrations

- [x] 1.1 Criar migration `infrastructure/migrations/0004_iam_auth_sessions.sql` contendo `iam.user_credentials`, `iam.sessions` e `iam.mfa_methods` com RLS habilitado, policies tenant-scoped e FKs compostas `(tenant_id, user_id)`.
- [x] 1.2 Atualizar testes de migração e validar aplicação da migration 0004 em banco de dados limpo com verificação de constraints e índices.

## 2. Domínio e Criptografia IAM

- [x] 2.1 Implementar utilitários e entidades de domínio para credenciais com hashing `scrypt` e criptografia AES-256-GCM para segredos em `apps/api/src/modules/iam/domain/`.
- [x] 2.2 Implementar motor TOTP (RFC 6238) nativo com HMAC-SHA1, tolerância temporal de ±1 step e gerador de códigos de backup com hashing.
- [x] 2.3 Modelar agregados de sessão `UserSession` e repositórios PostgreSQL para persistência de credenciais, sessões e métodos MFA.

## 3. Serviços de Aplicação e Cache Redis

- [x] 3.1 Implementar `SessionService` integrando PostgreSQL (`iam.sessions`) e Redis (`iam:session:<session_id>`) com suporte a emissão, renovação com rotação de refresh token e revogação imediata.
- [x] 3.2 Implementar `AuthService` orquestrando login com credenciais, desafio de segundo fator (MFA) para perfis privilegiados, emissão atômica no Transactional Outbox e registro em auditoria.
- [x] 3.3 Implementar `JwtAuthGuard` tenant-aware no NestJS validando access tokens, consultando revogação no Redis e populando `RequestContextService`.

## 4. Controladores HTTP e Validação

- [x] 4.1 Implementar `AuthController` com endpoints REST (`/login`, `/mfa/verify`, `/refresh`, `/logout`, `/sessions`) protegidos e validados com esquemas Zod.
- [x] 4.2 Registrar novos componentes, guards e providers no `IamModule` e `AppModule`.

## 5. Testes e Verificação Integrada

- [x] 5.1 Implementar testes unitários para hashing de credenciais, motor TOTP, rotação de refresh tokens e guards.
- [x] 5.2 Implementar testes de integração PostgreSQL + Redis cobrindo login com e sem MFA, revogação imediata de sessão, expiração de tokens e isolamento RLS cross-tenant.
- [x] 5.3 Executar build, linters e testes locais (`pnpm test:api`, `pnpm lint:api`, `pnpm build:api`).
- [x] 5.4 Validar change no OpenSpec (`openspec validate iam-auth-sessions-and-mfa --strict`) e submeter para revisão.

## Workflow follow-up

- Solicitar aprovação do usuário antes de iniciar a implementação com apply change.
- Acompanhar execução do CI no GitHub Actions após a implementação.
