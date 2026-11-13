# Proposal

## Why

O plano de engenharia do Milestone M0 estabelece as entregas de `web skeleton` e `mobile skeleton` no monorepo para fechar a fundação de código da plataforma. Atualmente, os diretórios `apps/web`, `apps/driver-mobile` e `apps/passenger-mobile` contêm apenas arquivos `README.md` vazios. É necessário materializar os skeletons dos clientes de acordo com a stack aprovada nos ADRs (Next.js + React + TypeScript para Web, e Flutter + Dart para Mobile) sem violar o isolamento das etapas futuras (M1 a M6).

## What Changes

- Inicializar o skeleton do frontend web em `apps/web` com Next.js 15 (App Router), React 19, TypeScript e Tailwind CSS.
- Estruturar o layout base do portal web com casca navegável (menu lateral retrátil, header de status operacional e container responsivo para o futuro dashboard de M6), mantendo os dados estáticos/mockados sem antecipar regras de domínio.
- Registrar `apps/web` no `pnpm-workspace.yaml` e criar os scripts `dev:web`, `build:web` e `lint:web` no `package.json` raiz.
- Materializar os skeletons das aplicações mobile Flutter em `apps/driver-mobile` (aplicativo do motorista) e `apps/passenger-mobile` (aplicativo do passageiro) com `pubspec.yaml`, `analysis_options.yaml` e ponto de entrada `lib/main.dart` com bootstrap básico.
- Adicionar os jobs de build/lint da web no pipeline de CI.
- Fora do escopo: login e integração com Identity Provider (M1), mapas interativos e tracking em tempo real (M6), sincronização offline e persistência Drift/SQLite mobile (M5), e APIs de negócio.

## Capabilities

### New Capabilities

- `platform/client-skeletons`: Estrutura base executável e integrada para as aplicações Web (Next.js) e Mobile (Flutter).

### Modified Capabilities

Nenhuma.

## Impact

- `pnpm-workspace.yaml`, `package.json` raiz, `.github/workflows/ci.yml`.
- Diretórios `apps/web/`, `apps/driver-mobile/`, `apps/passenger-mobile/`.
- Permite validação de compilação da aplicação web no monorepo pnpm sem afetar a API existente.

