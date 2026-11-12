# Spec Delta

## Purpose

Garante consistência entre mudanças transacionais e eventos assíncronos, além de impedir efeitos duplicados em consumers sob entrega at-least-once.

## ADDED Requirements

### Requirement: Evento Outbox participa da transação de domínio
Um evento Outbox MUST ser persistido na mesma transação PostgreSQL da mudança que o originou.

#### Scenario: Transação confirmada
- **WHEN** a mudança de domínio e o evento Outbox são gravados com sucesso
- **THEN** ambos ficam persistidos após o commit

#### Scenario: Transação revertida
- **WHEN** qualquer etapa da transação falha antes do commit
- **THEN** nem a mudança de domínio nem o evento Outbox ficam persistidos

### Requirement: Somente eventos pendentes podem ser reivindicados
O processamento Outbox MUST selecionar eventos sem `published_at` e impedir que workers concorrentes reivindiquem simultaneamente o mesmo registro.

#### Scenario: Evento ainda não publicado
- **WHEN** um worker reivindica eventos pendentes dentro de uma transação
- **THEN** recebe eventos ordenados e bloqueados para outros workers concorrentes até o fim da transação

#### Scenario: Evento já publicado
- **WHEN** um evento possui `published_at`
- **THEN** ele não aparece entre os eventos pendentes

### Requirement: Marcação de publicação é idempotente
A confirmação de publicação MUST alterar somente eventos ainda pendentes.

#### Scenario: Primeira confirmação
- **WHEN** um evento pendente é confirmado como publicado
- **THEN** seu `published_at` é registrado e a operação informa que houve alteração

#### Scenario: Confirmação repetida
- **WHEN** o mesmo evento já publicado é confirmado novamente
- **THEN** nenhum estado adicional é alterado e a operação informa que não houve alteração

### Requirement: Consumer executa mensagem uma única vez
O Inbox MUST deduplicar por tenant, consumer e message ID dentro da mesma transação do efeito processado.

#### Scenario: Primeira entrega
- **WHEN** uma mensagem ainda não registrada é processada com sucesso
- **THEN** o efeito e o resultado Inbox são confirmados juntos

#### Scenario: Entrega repetida
- **WHEN** a mesma combinação tenant, consumer e message ID chega novamente
- **THEN** o trabalho não é repetido e o resultado anteriormente persistido é devolvido

#### Scenario: Processamento falha
- **WHEN** o trabalho do consumer lança erro
- **THEN** o registro Inbox e seus efeitos são revertidos, permitindo nova tentativa válida

### Requirement: Mensageria respeita isolamento tenant
Consultas e mutações Outbox/Inbox MUST operar somente no tenant estabelecido pela transação atual.

#### Scenario: Tenant tenta acessar registro de outro tenant
- **WHEN** uma transação do Tenant A consulta ou altera identificador pertencente ao Tenant B
- **THEN** o registro do Tenant B não é visível nem alterado
