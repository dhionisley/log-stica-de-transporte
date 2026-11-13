# Design

## Context

O Milestone M0 prevê monorepo unificado com backend NestJS, frontend Next.js e mobile Flutter. A API já está operacional com health checks, RLS, transactional outbox/inbox, migration runner e tracing. Para fechar o gate do M0, os projetos clientes devem deixar de ser simples READMEs e passar a existir com suas estruturas de projeto canônicas.

## Goals / Non-Goals

**Goals:**
- Configurar `apps/web` com Next.js 15, React 19, TypeScript e Tailwind CSS.
- Integrar `apps/web` ao workspace pnpm (`@transport/web`).
- Criar a casca do layout da Central de Operações (menu lateral, header e área de conteúdo), alinhando a estrutura com a referência visual para M6.
- Configurar `apps/driver-mobile` e `apps/passenger-mobile` com manifestos `pubspec.yaml`, regras de análise `analysis_options.yaml` e `lib/main.dart`.
- Integrar o build e lint da aplicação Web ao pipeline de CI (`ci.yml`).

**Non-Goals:**
- Integração de autenticação ou fluxo de login com IdP (M1).
- Camada de comunicação realtime com WebSocket e mapas interativos (M6).
- Sincronização offline e persistência local SQLite no Flutter (M5).

## Decisions

### 1. Next.js 15 App Router com Tailwind CSS
- Estrutura:
  - `apps/web/package.json` (`@transport/web`)
  - `apps/web/src/app/layout.tsx` e `page.tsx`
  - `apps/web/src/components/navigation/sidebar.tsx`
  - `apps/web/src/components/navigation/header.tsx`
  - `apps/web/tailwind.config.ts` e `postcss.config.mjs`
  - `apps/web/tsconfig.json`
- Estilo: Tailwind CSS para permitir layout responsivo, limpo e componível.

### 2. Workspace Monorepo
- Atualizar `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
- Adicionar scripts no `package.json` raiz:
  - `"dev:web": "pnpm --filter @transport/web dev"`
  - `"build:web": "pnpm --filter @transport/web build"`
  - `"lint:web": "pnpm --filter @transport/web lint"`

### 3. Flutter Mobile Skeletons
- `apps/driver-mobile`:
  - `pubspec.yaml` (name: `driver_mobile`, SDK: `>=3.3.0 <4.0.0`)
  - `analysis_options.yaml`
  - `lib/main.dart` com MaterialApp "Transport Driver"
- `apps/passenger-mobile`:
  - `pubspec.yaml` (name: `passenger_mobile`, SDK: `>=3.3.0 <4.0.0`)
  - `analysis_options.yaml`
  - `lib/main.dart` com MaterialApp "Transport Passenger"

## Risks / Trade-offs

- [Novas dependências de frontend aumentam tempo de pnpm install] → Usar lockfile versionado e cache pnpm no CI.
- [Flutter CLI pode não estar instalado na máquina local do desenvolvedor] → Os manifestos e o código Dart são mantidos válidos e testáveis por analisadores estáticos sem bloquear o fluxo do monorepo pnpm.

## Migration Plan

Materializar os arquivos, instalar dependências no monorepo, validar `build:web` e `lint:web` localmente, atualizar o workflow do GitHub Actions e verificar execução remota.

