# Spec Delta

## Purpose

Garante que o schema do banco seja construído de forma reproduzível, ordenada e rastreável, sem reaplicar nem alterar silenciosamente migrations já executadas.

## ADDED Requirements

### Requirement: Migrations pendentes são aplicadas em ordem
O runner MUST aplicar, em ordem lexicográfica do nome do arquivo, apenas as migrations ainda não registradas.

#### Scenario: Banco limpo
- **WHEN** o runner executa contra banco sem tabela de controle
- **THEN** cria a tabela de controle, aplica todas as migrations em ordem e registra cada uma

#### Scenario: Reexecução
- **WHEN** o runner executa novamente sem novas migrations
- **THEN** nada é reaplicado e o resultado informa que o banco está atualizado

### Requirement: Migrations aplicadas são imutáveis
O runner MUST registrar o checksum de cada migration e falhar quando o arquivo de uma migration já aplicada tiver conteúdo diferente.

#### Scenario: Arquivo alterado
- **WHEN** o checksum do arquivo difere do registrado
- **THEN** o runner falha sem aplicar nenhuma migration

### Requirement: Aplicação atômica
Cada migration SHALL ser aplicada em transação junto com seu registro de controle.

#### Scenario: Erro em migration
- **WHEN** uma instrução SQL falha
- **THEN** a migration e seu registro são revertidos e as seguintes não são executadas

### Requirement: Execuções concorrentes são serializadas
O runner MUST adquirir um lock exclusivo no banco antes de aplicar migrations.

#### Scenario: Dois runners simultâneos
- **WHEN** dois runners iniciam ao mesmo tempo
- **THEN** apenas um aplica migrations e o outro espera e encontra o banco atualizado

### Requirement: Execução portável e sem expor credenciais
O runner MUST funcionar sem `psql` e sem sintaxe específica de shell, lendo `DATABASE_URL` do ambiente, e MUST NOT registrar a URL de conexão.

#### Scenario: Falha de conexão
- **WHEN** a conexão com o banco falha
- **THEN** a mensagem de erro não contém a URL nem a senha

