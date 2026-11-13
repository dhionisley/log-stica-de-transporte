# Spec Delta

## Purpose

Define os requisitos fundamentais para os skeletons das aplicações clientes (Web e Mobile), assegurando a inicialização correta das ferramentas, estrutura de monorepo e conformidade com a arquitetura definida.

## ADDED Requirements

### Requirement: Aplicação Web integrada ao workspace
A aplicação Web MUST residir em `apps/web`, ser gerenciada como pacote do monorepo pnpm e compilar via TypeScript e Next.js sem erros.

#### Scenario: Compilação da aplicação Web
- **WHEN** o comando `pnpm build:web` é executado
- **THEN** o build do Next.js conclui com sucesso gerando os artefatos estáticos e do servidor

### Requirement: Layout base do Portal Web
O frontend web SHALL apresentar uma casca de interface responsiva com navegação lateral (menu estruturado para Operações, Viagens, Frota, Configurações), cabeçalho e área de trabalho modular.

#### Scenario: Acesso ao Portal Web
- **WHEN** o usuário carrega a rota raiz da aplicação web
- **THEN** a estrutura de layout com navegação lateral e painel principal é renderizada

### Requirement: Skeletons Flutter para Driver e Passenger
Os projetos mobile MUST residir em `apps/driver-mobile` e `apps/passenger-mobile` com manifestos `pubspec.yaml` válidos e pontos de entrada Dart independentes.

#### Scenario: Estrutura do projeto Driver Mobile
- **WHEN** inspecionado o diretório `apps/driver-mobile`
- **THEN** possui `pubspec.yaml` definindo nome e dependências básicas do Flutter e `lib/main.dart` com widget raiz

#### Scenario: Estrutura do projeto Passenger Mobile
- **WHEN** inspecionado o diretório `apps/passenger-mobile`
- **THEN** possui `pubspec.yaml` definindo nome e dependências básicas do Flutter e `lib/main.dart` com widget raiz

