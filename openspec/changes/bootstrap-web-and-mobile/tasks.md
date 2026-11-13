# Tasks

## 1. Web Skeleton (Next.js)

- [x] 1.1 Configurar `apps/web/package.json` (`@transport/web`), `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` e `next.config.mjs`.
- [x] 1.2 Atualizar `pnpm-workspace.yaml` e adicionar scripts de web (`dev:web`, `build:web`, `lint:web`) no `package.json` raiz.
- [x] 1.3 Implementar estrutura App Router (`layout.tsx`, `page.tsx`, `globals.css`) e componentes de casca de navegação (Sidebar e Header).
- [x] 1.4 Instalar dependências e validar compilação com `pnpm build:web`.

## 2. Mobile Skeletons (Flutter)

- [x] 2.1 Criar estrutura do `apps/driver-mobile` com `pubspec.yaml`, `analysis_options.yaml` e `lib/main.dart`.
- [x] 2.2 Criar estrutura do `apps/passenger-mobile` com `pubspec.yaml`, `analysis_options.yaml` e `lib/main.dart`.

## 3. Integração ao CI e Verificação

- [x] 3.1 Atualizar `.github/workflows/ci.yml` para incluir build e lint da aplicação Web no job `quality`.
- [x] 3.2 Executar build e testes locais de todos os pacotes sem regressões.
- [ ] 3.3 Confirmar pipeline CI verde no GitHub Actions, validar OpenSpec em modo estrito e atualizar `docs/ETAPA-10-STATUS.md`.

## Workflow follow-up

- Solicitar aprovação antes de arquivar.

