# Etapa 10 — Bootstrap Status

## Presente no bootstrap
- monorepo/workspace skeleton;
- NestJS API bootstrap;
- health/live e health/ready básicos, ainda sem dependências reais no readiness;
- PostgreSQL/PostGIS local;
- Redis local;
- schemas foundation;
- Tenant table;
- IAM user skeleton;
- tenant-scoped RLS policies;
- Audit append-only table;
- Transactional Outbox;
- Inbox/dedup foundation;
- tenant transaction helper using transaction-local `app.tenant_id`;
- CI skeleton;
- OpenSpec 1.15.0 inicializado para Codex;
- optimization service boundary;
- mobile/web placeholders.

## Verificado em 2026-11-10

- repositório materializado e Git inicializado na branch `main`;
- dependências instaladas com pnpm 10 e lockfile gerado;
- build NestJS/TypeScript concluído;
- 2 suítes e 4 testes unitários de health e tenant transaction aprovados;
- API iniciada localmente e endpoints `health/live` e `health/ready` consultados com sucesso;
- arquitetura e restrições registradas no OpenSpec.

## Verificado em 2026-11-11

- Docker Desktop 4.99.0, WSL 2.7.14 e Docker Engine 29.9.3 operacionais;
- PostgreSQL/PostGIS e Redis iniciados pelo Docker Compose;
- PostgreSQL reportou `healthy` e Redis respondeu `PONG`;
- migration `0001_foundation.sql` aplicada em banco limpo;
- extensões PostGIS e pgcrypto, schemas, tabelas, policies e índices criados;
- teste RLS executado com a role não proprietária `transport_rls_test`;
- Tenant A não conseguiu visualizar o usuário pertencente ao Tenant B.

## Runtime readiness M0

- configuração obrigatória validada com Zod antes da inicialização;
- providers compartilhados para PostgreSQL e Redis com shutdown controlado;
- `health/live` permanece independente das dependências;
- `health/ready` consulta PostgreSQL e Redis em paralelo;
- readiness responde HTTP 200 quando ambas estão disponíveis e HTTP 503 quando qualquer uma falha;
- payload informa apenas `up`/`down`, sem expor mensagens ou credenciais dos drivers.
- build NestJS agora usa `tsconfig.build.json`, exclui testes e limpa `dist` para impedir execução de artefatos antigos;
- verificação integrada confirmou a sequência readiness 200 → 503 com Redis indisponível → 200 após restauração.

## Transactional Outbox + Inbox M0

- contrato interno de evento versionado sem dependência de framework;
- append Outbox recebe o mesmo `PoolClient` da transação de domínio;
- claim de pendências usa ordenação e `FOR UPDATE SKIP LOCKED`;
- marcação de publicação altera somente evento ainda pendente;
- Inbox deduplica por tenant, consumer e message ID e devolve o resultado anterior;
- falha do consumer reverte claim e efeito na mesma transação;
- suíte Jest de integração separada dos testes unitários;
- 8 testes de integração PostgreSQL aprovados, incluindo commit, rollback, concorrência, repetição e isolamento Outbox/Inbox entre tenants.

## Deliberadamente ainda não implementado
- Identity Provider/auth final;
- MFA;
- permission profiles;
- production-ready DB role provisioning;
- Drizzle schemas/repositories;
- BullMQ workers;
- OpenTelemetry exporter/backend;
- Next.js app bootstrap;
- Flutter projects;
- production IaC/cloud.

Esses itens são os próximos incrementos de M0/M1; não devem ser considerados prontos apenas porque os diretórios existem.

## Request observability M0

- AsyncLocalStorage encapsulado em provider global, com isolamento verificado em requisicoes concorrentes;
- middleware preserva X-Request-Id valido, substitui invalido por UUID e devolve o header;
- trace ID so e registrado quando existe span ativo (sem SDK, o campo e omitido);
- logger JSON estruturado integrado ao NestJS, com redaction recursiva e protecao contra referencias circulares;
- 5 suites e 18 testes unitarios aprovados; integracao PostgreSQL e verificacao HTTP local pendentes de acesso ao Docker/rede no ambiente do agente.

- verificado em 2026-11-12: 8 testes de integracao PostgreSQL aprovados sem regressao; endpoint local preservou X-Request-Id valido (abc-123) e gerou UUID para valor invalido.

## CI quality gates M0

- CI separado em jobs quality (lint, build, unit), integration (PostGIS + Redis, migration em banco limpo, integracao) e security (pnpm audit, gitleaks, CodeQL);
- instalacao com --frozen-lockfile e versao do pnpm vinda de packageManager;
- ESLint 9 + typescript-eslint adicionados como devDependencies de apps/api; lint sem erros;
- verificado localmente em 2026-11-12: lint, build, 18 testes unitarios, 8 de integracao e pnpm audit (sem severidade alta/critica; 1 baixa e 5 moderadas);
- pendente: execucao do CI remoto no GitHub (gitleaks e CodeQL so rodam la) e scan de container/IaC, fora do escopo ate existir Dockerfile/IaC.

- CI remoto verificado em 2026-11-12 no GitHub Actions (commit 0911a18): quality, integration (migration em banco limpo + 8 testes) e security (audit, gitleaks sem vazamentos, CodeQL) aprovados;
- avisos nao bloqueantes: Node 20 nas actions, codeql-action@v3 sera descontinuado em dez/2026 e migracao do ubuntu-latest.

## Database migrations runner M0

- runner portavel em Node.js (sem dependencia de psql no host) implementado em apps/api/src/tooling;
- controle por tabela platform.schema_migrations com checksum SHA-256 e advisory lock exclusivo;
- suporte a adocao automatica de schemas legados (0001 adotada com sucesso no banco local);
- rollback e protecao contra migrations corrompidas comprovados por testes de integracao;
- script db:migrate e job de integracao do CI atualizados para usar o novo runner;
- 6 suites e 28 testes unitarios + 2 suites e 13 testes de integracao aprovados.

- CI remoto verificado em 2026-11-12 no GitHub Actions (commit 635dc83): quality, integration (migrations via novo runner + 13 testes de integracao) e security todos aprovados (success).

## Tracing baseline M0

- TracerProvider OpenTelemetry inicializado no modulo de observabilidade com Resource de servico configuravel;
- propagador global W3C Trace Context (traceparent) habilitado;
- RequestContextMiddleware inicia span ativo para cada requisicao HTTP e o encerra no fechamento da conexao;
- correlacao completa: trace_id do span ativo e injetado no RequestContextService e emitido nos logs estruturados;
- 7 suites e 35 testes unitarios aprovados sem dependencias remotas mandatorias.

- CI remoto verificado em 2026-11-13 no GitHub Actions (commit 4252389): quality (lint, build, 35 testes unitarios), integration (novo runner de migrations em banco limpo, 13 testes de integracao) e security (SCA, gitleaks, CodeQL) todos aprovados (success).

## Web e Mobile Skeletons M0

- aplicacao Web (apps/web) materializada com Next.js 15, React 19, TypeScript e Tailwind CSS integrada ao workspace pnpm;
- casca navegavel da Central de Operacoes (Sidebar, Header e painel modular) implementada como base arquitetural para M6;
- projetos mobile Flutter canônicos criados em apps/driver-mobile e apps/passenger-mobile (pubspec.yaml, analysis_options.yaml e lib/main.dart);
- build:web e lint:web validados com sucesso e integrados ao job quality do CI;
- API NestJS permanece 100% integra com 35 testes unitarios aprovados sem regressoes.

- CI remoto verificado em 2026-11-13 no GitHub Actions (commit e6a062a): quality (lint:api, lint:web, build:api, build:web, 35 testes unitarios), integration (novo runner de migrations em banco limpo, 13 testes de integracao) e security (SCA sem vulnerabilidades altas/criticas, gitleaks, CodeQL) todos aprovados (success).

## Tenant Lifecycle & Control Plane (M1 Incremento 1)

- migration 0002_tenant_lifecycle.sql adicionada com platform.tenant_settings e platform.tenant_branding com RLS;
- agregado Tenant implementado com maquina de estados (PROVISIONED -> ACTIVE -> SUSPENDED -> TERMINATED);
- TenantManagementService orquestra ciclo de vida com emissao de eventos no Outbox e auditoria imutavel em transacao unica;
- endpoints REST em TenantController protegidos e validados com esquemas Zod;
- 8 suites e 44 testes unitarios + 3 suites de integracao com PostgreSQL e Redis.

- CI remoto verificado em 2026-11-13 no GitHub Actions: quality (lint:api, lint:web, build:api, build:web, 44 testes unitarios), integration (runner de migrations com 0001 e 0002 em banco limpo, testes de integracao de ciclo de vida e mensageria confiavel) e security (SCA, gitleaks, CodeQL) todos aprovados (success).

## IAM Identity & RBAC (M1 Incremento 2)

- migration 0003_iam_rbac.sql adicionada com catalogo global iam.permissions, enriquecimento de iam.users e tabelas tenant-scoped iam.permission_profiles, iam.permission_profile_permissions e iam.user_profile_assignments com RLS;
- chaves estrangeiras compostas tenant-aware (tenant_id, profile_id) e (tenant_id, user_id) garantindo integridade contra associacoes cross-tenant;
- agregados User, PermissionProfile e UserProfileAssignment implementados no modulo IAM com invariantes de dominio;
- IamManagementService e AuthorizationService orquestram ciclo de vida de usuarios, perfis e resolucao contextual de permissoes com atomicidade de Transactional Outbox e auditoria append-only;
- endpoints REST em IamController com validacao rigorosa via esquemas Zod;
- 9 suites e 54 testes unitarios locais aprovados (+10 novos testes de dominio IAM) + nova suite de testes de integracao PostgreSQL em iam-rbac.integration-spec.ts;
- build:api, build:web, lint:api e lint:web concluidos com 0 erros;
- CI remoto verificado em 2026-11-16 no GitHub Actions (commit 4fa3b1f, Run 17 / Run ID 43955393903): quality (lint:api, lint:web, build:api, build:web, 54 testes unitarios), integration (runner de migrations com 0001, 0002 e 0003 em banco limpo, 4 suites de testes de integracao) e security (SCA sem vulnerabilidades altas/criticas, gitleaks, CodeQL) todos aprovados (success).

## IAM Authentication, Sessions & MFA (M1 Incremento 3)

- migration 0004_iam_auth_sessions.sql adicionada com iam.user_credentials, iam.sessions e iam.mfa_methods protegidas por RLS e chaves estrangeiras tenant-aware (tenant_id, user_id);
- hashing de senhas implementado com scrypt e salt criptografico individual por credencial com proteção de bloqueio temporario (lockout apos 5 falhas consecutivas);
- segredos de segundo fator protegidos em repouso com cifragem AES-256-GCM;
- motor TOTP nativo (RFC 6238) com HMAC-SHA1, 6 digitos, janela de tolerancia de 30s (+-1 step) e gerador de codigos de backup unicos com hash SHA-256;
- gestao de sessoes revogaveis em duas camadas: persistencia em iam.sessions (PostgreSQL com RLS) e cache de validacao sub-milissegundo em Redis (iam:session:<id>);
- rotatividade de refresh token com deteccao e revogacao imediata de toda a arvore de sessoes em caso de tentativa de reuso malicioso;
- desafio obrigatorio de MFA para usuarios com flag mfa_required e perfis administrativos/supervisores;
- JwtAuthGuard tenant-aware com suporte a @Public(), validacao de assinatura e revogacao de sessao no Redis e injecao de tenantId no RequestContextService;
- AuthController com endpoints REST (/login, /mfa/verify, /refresh, /logout, /mfa/setup, /mfa/activate, /users/:id/password) validados com Zod;
- 10 suites e 66 testes unitarios locais aprovados (+12 novos testes em iam-auth.spec.ts) e suite completa de testes de integracao em iam-auth.integration-spec.ts;
- build:api, build:web, lint:api e lint:web validados com sucesso;
- CI remoto verificado em 2026-11-18 no GitHub Actions (commit 4690345, Run 21 / Run ID 44325931365): quality (lint:api, lint:web, build:api, build:web, 66 testes unitarios), integration (runner de migrations com 0001, 0002, 0003 e 0004 em banco limpo, 5 suites de testes de integracao) e security (SCA com pnpm audit zero falhas, gitleaks, CodeQL) todos aprovados (success).

## Plans, Entitlements & Subscriptions (M1 Incremento 4)

- migration 0005_plans_and_entitlements.sql adicionada com catalogo global platform.plans, platform.plan_features e assinaturas tenant-scoped platform.subscriptions com RLS habilitado e chaves estrangeiras compostas;
- seeds dos planos padrao (STARTER, PROFESSIONAL, ENTERPRISE) com limites quantitativos e feature flags operacionais;
- agregados Plan, PlanFeature e Subscription modelados com maquina de estados e invariantes de negocio;
- EntitlementService com resolucao de direitos em tempo de execucao, padrao de sobreposicao (overlay de custom_limits) e cache no Redis (platform:entitlements:<tenant_id>);
- SubscriptionManagementService orquestrando criacao, atualizacao de limites customizados e troca de plano com eventos no Transactional Outbox (SubscriptionCreated, PlanChanged, CustomLimitsUpdated) e auditoria imutavel;
- EntitlementGuard e decorator @RequireFeature integrados para protecao declarativa de endpoints na API;
- PlanController e SubscriptionController com endpoints REST protegidos e validados com esquemas Zod;
- 11 suites e 75 testes unitarios locais aprovados (+9 novos testes em plans-entitlements.spec.ts) e suite de testes de integracao em plans-entitlements.integration-spec.ts;
- build:api, build:web, lint:api e lint:web validados com 0 erros;
- CI remoto verificado em 2026-11-18 no GitHub Actions (commit aaff829, Run 25 / Run ID 44345872282): quality (lint:api, lint:web, build:api, build:web, 75 testes unitarios), integration (runner de migrations com 0001, 0002, 0003, 0004 e 0005 em banco limpo, 6 suites de testes de integracao) e security (SCA com pnpm audit zero falhas, gitleaks, CodeQL) todos aprovados (success).
- Milestone M1 (SaaS Control Plane + IAM) 100% concluído.

## Client Companies Master Data (M2 Incremento 1)

- migration 0006_crm_client_companies.sql adicionada com schema crm, tabelas crm.client_companies e crm.company_users com RLS estrito habilitado e chaves compostas tenant-aware (tenant_id, id);
- constraint de unicidade composta (tenant_id, tax_id) garantindo unicidade de CNPJ por tenant, permitindo atendimento multilocatário da mesma empresa em locatários distintos;
- agregado ClientCompany implementado com máquina de estados (ACTIVE, INACTIVE, BLOCKED), validação estrita de dígito verificador de CNPJ (Receita Federal) e Value Objects para billing_address e contacts;
- PostgresClientCompanyRepository e ClientCompanyManagementService orquestrando persistência com concorrência otimista (version), publicação atômica no Transactional Outbox (ClientCompanyCreated, ClientCompanyUpdated, ClientCompanyStatusChanged) e auditoria imutável em audit.audit_records;
- ClientCompanyController expondo endpoints REST validados com Zod (/clients, /clients/:id, /clients/:id/status);
- 12 suítes e 85 testes unitários locais aprovados (+10 novos testes em client-companies.spec.ts) e suíte completa de integração PostgreSQL em client-companies.integration-spec.ts;
- build:api, build:web, lint:api e lint:web validados com 0 erros;
- CI remoto verificado em 2026-11-19 no GitHub Actions (commit 1839567, Run 27 / Run ID 44599423665): quality (lint:api, lint:web, build:api, build:web, 85 testes unitarios), integration (runner de migrations com 0001 a 0006 em banco limpo, 7 suítes de testes de integração) e security (SCA, gitleaks, CodeQL) todos aprovados (success).

## People & Workforce Master Data (M2 Incremento 2)

- migration 0007_workforce_people_and_employment.sql adicionada com schema workforce e tabelas workforce.people, workforce.employees, workforce.company_employments e workforce.provisional_transport_authorizations com RLS estrito e chaves compostas tenant-aware;
- agregado Person com validação matemática estrita de dígitos verificadores de CPF (Receita Federal) e unicidade por tenant;
- agregado Employee com controle de estado de conta (LINKED/UNLINKED) e ciclo de vida (ACTIVE, INACTIVE, SUSPENDED com justificativa mandatória);
- entidade CompanyEmployment suportando colaboradores com múltiplos vínculos simultâneos em empresas clientes contratantes distintas, com validação de vigência temporal (valid_from/valid_to) e gate de privacidade restrito (uma empresa cliente nunca visualiza vínculos de outra empresa);
- entidade ProvisionalTransportAuthorization gerenciando autorizações temporárias de passageiro com período de vigência e auditoria de concessão/revogação;
- PostgresWorkforceRepository e WorkforceManagementService orquestrando concorrência otimista (version), publicação confiável no Transactional Outbox (PersonCreated, PersonUpdated, EmployeeCreated, EmployeeStatusChanged, CompanyEmploymentCreated, CompanyEmploymentTerminated, ProvisionalAuthorizationGranted, ProvisionalAuthorizationRevoked) e auditoria append-only em audit.audit_records;
- WorkforceController expondo endpoints REST validados com Zod (/workforce/people, /workforce/employees, /workforce/employments, /workforce/provisional-authorizations);
- 13 suítes e 101 testes unitários locais aprovados (+16 novos testes em workforce.spec.ts) e suíte completa de integração PostgreSQL em workforce.integration-spec.ts;
- build:api, build:web, lint:api e lint:web validados com 0 erros;
- CI remoto verificado em 2026-11-19 no GitHub Actions (commit 983fa26, Run 29 / Run ID 44611840495): quality (lint:api, lint:web, build:api, build:web, 101 testes unitarios), integration (runner de migrations com 0001 a 0007 em banco limpo, 8 suítes de testes de integração) e security (SCA, gitleaks, CodeQL) todos aprovados (success).

## Fleet Vehicles, Drivers & Eligibility Gate (M2 Incremento 3)

- migration 0008_fleet_and_driver_eligibility.sql adicionada com schemas fleet e workforce, implementando tabelas fleet.vehicles, fleet.vehicle_documents, workforce.drivers, workforce.driver_documents e workforce.driver_eligibilities com RLS estrito e chaves compostas tenant-aware;
- recomendação V1 da Seção 28 do Modelo de Dados cumprida: tabelas físicas separadas para documentos de veículos e motoristas em vez de tabelas polimórficas, garantindo integridade referencial forte;
- agregado Vehicle com placa normalizada única por tenant (plate_normalized), categorias (CAR, VAN, MINIBUS, BUS), capacidade física de assentos, recursos de acessibilidade e ciclo de vida operacional (AVAILABLE, IN_MAINTENANCE, OUT_OF_SERVICE);
- agregado Driver qualificado a partir de Person, com controle de número e categoria de CNH (A, B, C, D, E e combinações), validade da habilitação e ciclo de vida (ACTIVE, INACTIVE, SUSPENDED com motivo auditado);
- motor de domínio EligibilityService com matriz estrita de compatibilidade de CNH versus classe de veículo, verificação de expiração temporal de CNH e documentos regulatórios (CRLV, seguro, toxicológico), e bloqueio categorizado de recursos inaptos (gate mandatório de inelegibilidade do M2);
- PostgresVehicleRepository e expansão de PostgresWorkforceRepository com concorrência otimista (version), publicação confiável no Transactional Outbox (VehicleCreated, VehicleUpdated, VehicleOperationalStatusChanged, VehicleDocumentAttached, DriverCreated, DriverUpdated, DriverSuspended, DriverReactivated, DriverDocumentAttached) e auditoria append-only em audit.audit_records;
- FleetModule e controllers REST VehicleController e rotas em WorkforceController expondo endpoints validados com Zod;
- 15 suítes e 118 testes unitários locais aprovados (+17 novos testes em fleet.spec.ts e driver.spec.ts) e suíte de integração PostgreSQL em fleet.integration-spec.ts;
- build:api, build:web, lint:api e lint:web validados com 0 erros;
- CI remoto verificado em 2026-11-21 no GitHub Actions (commit ed48c35): quality (lint:api, lint:web, build:api, build:web, 118 testes unitários), integration (runner de migrations com 0001 a 0008 em banco limpo, 9 suítes de testes de integração) e security (SCA com pnpm audit zero falhas, gitleaks, CodeQL) todos aprovados (success).

## Operational Locations & Geofences (M2 Incremento 4 — Fechamento do Milestone M2)

- migration 0009_service_locations_and_geofences.sql adicionada com schema service e tabela service.service_locations com suporte espacial nativo PostGIS (geography(Point, 4326) e geography(Polygon, 4326)), RLS estrito e chaves compostas tenant-aware;
- índices espaciais GIST em point e geofence para alta performance em buscas de proximidade (ST_DWithin) e contenção;
- agregado ServiceLocation com Value Objects GeoPoint (validação rigorosa de coordenadas WGS 84: latitude [-90, 90], longitude [-180, 180]) e GeofencePolygon (anéis fechados com pelo menos 4 vértices);
- tipos de locais suportados (CLIENT_SITE, OPERATIONAL_BASE, STOP_POINT, PASSENGER_PICKUP) com vínculo opcional a empresas clientes (client_company_id) isolado por tenant;
- algoritmo espacial de avaliação de presença em geofence híbrido (ray-casting para polígonos, distância geodésica Haversine para raios circulares);
- PostgresLocationRepository e LocationManagementService orquestrando persistência com concorrência otimista (version), publicação atômica no Transactional Outbox (LocationCreated, LocationUpdated, LocationGeofenceUpdated) e auditoria imutável em audit.audit_records;
- LocationModule e LocationController expondo endpoints REST validados com Zod (/locations, /locations/nearby, /locations/:id, /locations/:id/geofence, /locations/:id/evaluate-point);
- 16 suítes e 127 testes unitários locais aprovados (+9 novos testes em locations.spec.ts) e suíte completa de integração PostgreSQL com PostGIS em locations.integration-spec.ts;
- build:api, build:web, lint:api e lint:web validados com 0 erros;
- CI remoto verificado em 2026-11-21 no GitHub Actions (commit a0baa99): quality (lint:api, lint:web, build:api, build:web, 127 testes unitários), integration (runner de migrations com 0001 a 0009 em banco limpo, 10 suítes de testes de integração) e security (SCA com pnpm audit zero falhas, gitleaks, CodeQL) todos aprovados com 100% de sucesso;
- Milestone M2 (Operational Master Data) 100% concluído e arquivado.


