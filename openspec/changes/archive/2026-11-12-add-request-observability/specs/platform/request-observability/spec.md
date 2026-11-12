# Spec Delta

## Purpose

Permite correlacionar requisições e diagnósticos sem misturar contextos concorrentes nem expor campos sensíveis em logs estruturados.

## ADDED Requirements

### Requirement: Toda requisição possui identificador
A API MUST usar um `X-Request-Id` válido fornecido pelo cliente ou gerar um UUID quando ele estiver ausente ou inválido.

#### Scenario: Identificador válido fornecido
- **WHEN** a requisição contém `X-Request-Id` válido
- **THEN** o mesmo valor é usado no contexto e devolvido na resposta

#### Scenario: Identificador ausente ou inválido
- **WHEN** `X-Request-Id` está ausente, vazio, longo demais ou contém caracteres não permitidos
- **THEN** a API gera um UUID e o devolve na resposta

### Requirement: Contextos concorrentes permanecem isolados
O request ID e o trace ID MUST permanecer associados somente ao fluxo assíncrono da requisição correspondente.

#### Scenario: Requisições simultâneas
- **WHEN** duas requisições executam operações assíncronas sobrepostas
- **THEN** cada fluxo observa apenas seus próprios identificadores

### Requirement: Logs são estruturados e correlacionáveis
Cada log SHALL ser emitido como JSON com timestamp, nível, serviço, mensagem e identificadores disponíveis no contexto atual.

#### Scenario: Log dentro de requisição
- **WHEN** a aplicação registra uma mensagem durante uma requisição
- **THEN** o registro contém request ID e, quando disponível, trace ID

#### Scenario: Log fora de requisição
- **WHEN** um job ou bootstrap registra uma mensagem sem contexto HTTP
- **THEN** o registro continua válido sem inventar request ID

### Requirement: Campos sensíveis são redigidos
Objetos estruturados MUST substituir valores de chaves sensíveis conhecidas por `[REDACTED]` antes da emissão.

#### Scenario: Objeto contém credenciais
- **WHEN** metadados possuem token, authorization, cookie, password, secret ou API key em qualquer nível
- **THEN** os valores correspondentes não aparecem no JSON emitido
