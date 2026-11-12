# Proposal

## Why

O bootstrap da Etapa 10 existia apenas como arquivo ZIP e declarava componentes ainda não verificados. Esta mudança transforma o pacote em um repositório executável e registra evidências reais antes de iniciar M0/M1.

## What Changes

- Materializar o conteúdo do ZIP em um repositório Git com branch principal compatível com a configuração Nx.
- Inicializar OpenSpec 1.15.0 para Codex e registrar as restrições arquiteturais confirmadas.
- Instalar as dependências já aprovadas usando pnpm 10, gerar lockfile e executar build/testes.
- Adicionar testes automatizados para os comportamentos já presentes no bootstrap.
- Documentar resultados reais e bloqueios de ambiente sem marcar validações não executadas como concluídas.
- Fora do escopo: novas funcionalidades, autenticação final, dashboard, domínio operacional, providers e mudanças na arquitetura congelada.

## Capabilities

### New Capabilities

Nenhuma. Esta mudança trata somente de tooling, testes e documentação do bootstrap existente.

### Modified Capabilities

Nenhuma. Nenhum requisito de produto ou comportamento público será alterado.

## Impact

- Repositório e tooling: Git, pnpm lockfile, OpenSpec e regras de exclusão.
- Testes: API NestJS, health endpoints e helper transacional tenant-scoped.
- Documentação: status verificável da Etapa 10.
- Ambiente externo: Docker e `psql` continuam pré-requisitos para validar migration e RLS reais.
