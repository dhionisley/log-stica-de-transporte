# Design

## Context

NestJS usa logger padrão e a OpenTelemetry API está instalada sem SDK/exporter. O middleware HTTP é o boundary apropriado para iniciar contexto por requisição.

## Goals / Non-Goals

**Goals:** request ID determinístico, isolamento assíncrono, JSON logs, redaction recursiva e compatibilidade futura com OpenTelemetry.

**Non-Goals:** instrumentação automática, exportação, métricas, armazenamento ou análise centralizada.

## Decisions

### AsyncLocalStorage como contexto local

Um provider global encapsula `AsyncLocalStorage`; middleware cria o contexto e o logger o consulta. Variáveis globais simples foram rejeitadas por vazarem entre requisições concorrentes.

### Request ID com allowlist

Valores recebidos aceitam somente 1–128 caracteres alfanuméricos e `._:-`; demais valores são substituídos por UUID. Isso evita log injection e identificadores excessivos.

### Trace ID somente de span ativo

O middleware consulta a OpenTelemetry API e registra trace ID apenas quando há span válido. Não inventa trace ID e não confia diretamente em header externo sem propagator/SDK futuro.

### Logger JSON sem biblioteca nova

Um `LoggerService` NestJS serializa envelope estável e usa console por nível. Backend/exporter permanece aberto conforme ADR.

### Redaction recursiva

Objetos e arrays são copiados; chaves normalizadas de credenciais são substituídas. Bodies/headers não são logados automaticamente.

## Risks / Trade-offs

- [Mensagem string pode conter segredo] → chamadas devem usar metadados estruturados; redaction automática não tenta interpretar texto livre.
- [Objetos circulares] → serialização segura substitui referências circulares por marcador.
- [Sem SDK não existe trace ID] → campo é omitido até instrumentação futura aprovada.

## Migration Plan

Adicionar módulo/contexto/logger, integrar ao AppModule/main, executar testes e verificar header/log local. Rollback restaura logger padrão; não há migration de dados.
