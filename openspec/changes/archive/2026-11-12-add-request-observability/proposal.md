# Proposal

## Why

A API ainda usa logs padrão e não possui contexto de requisição propagado. Isso impede correlação confiável de falhas e cria risco de misturar ou registrar dados sensíveis sem estrutura.

## What Changes

- Aceitar `X-Request-Id` válido ou gerar um UUID quando ausente/inválido.
- Devolver o request ID em todas as respostas e mantê-lo isolado por fluxo assíncrono.
- Produzir logs JSON com timestamp, nível, serviço, contexto, request ID e trace ID disponível.
- Redigir chaves sensíveis em objetos estruturados.
- Integrar o logger ao NestJS e adicionar testes de concorrência e redaction.
- Fora do escopo: exporter, collector, backend de observabilidade, métricas, sampling e persistência de logs.

## Capabilities

### New Capabilities

- `platform/request-observability`: Correlação de requisições e logging estruturado seguro.

### Modified Capabilities

Nenhuma.

## Impact

- API HTTP interna e logs do processo.
- Nenhuma dependência nova; usa Node AsyncLocalStorage e OpenTelemetry API já aprovada.
- Preserva architecture, observability/DR, security e ADR de OpenTelemetry sem congelar provider.
