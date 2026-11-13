# Spec Delta

## Purpose

Estabelece a infraestrutura básica de rastreamento distribuído (tracing baseline) com OpenTelemetry, garantindo que toda requisição possua um trace correlacionável e compatível com o padrão W3C Trace Context.

## ADDED Requirements

### Requirement: Inicialização e encerramento controlado do TracerProvider
A API MUST inicializar um TracerProvider OpenTelemetry com o nome de serviço configurado (`OTEL_SERVICE_NAME`) e encerrá-lo adequadamente no shutdown da aplicação.

#### Scenario: Startup da aplicação
- **WHEN** a API inicia
- **THEN** o TracerProvider global é registrado com o nome de serviço do ambiente

#### Scenario: Encerramento gracioso
- **WHEN** os hooks de encerramento da aplicação são acionados
- **THEN** o SDK de tracing encerra sem vazamento de recursos ou tarefas pendentes

### Requirement: Propagação W3C Trace Context
A API MUST extrair o contexto de rastreamento do cabeçalho `traceparent` quando presente e válido, ou criar um novo trace ID raiz quando ausente ou inválido.

#### Scenario: Traceparent válido recebido
- **WHEN** uma requisição chega com cabeçalho `traceparent` em formato W3C válido
- **THEN** o span da requisição continua no mesmo `trace_id` e adota o parent span ID recebido

#### Scenario: Traceparent ausente ou malformado
- **WHEN** uma requisição chega sem cabeçalho `traceparent` ou com valor malformado
- **THEN** a API gera um novo span raiz com um `trace_id` válido e não nulo

### Requirement: Correlação com contexto de requisição e logs estruturados
O `trace_id` do span ativo MUST ser integrado ao `RequestContextService` e registrado no campo `trace_id` de todos os logs emitidos durante a requisição.

#### Scenario: Emissão de log durante requisição com trace ativo
- **WHEN** um log estruturado é registrado durante a execução da requisição
- **THEN** o registro JSON contém o mesmo `trace_id` do span da requisição

### Requirement: Isolamento e ausência de dependência remota mandatória
O tracing baseline SHALL operar localmente e em ambiente de testes sem requerer conexão de rede com collector ou servidor externo.

#### Scenario: Execução em ambiente isolado
- **WHEN** a API ou suíte de testes executa sem collector remoto configurado
- **THEN** a geração de traces e a correlação de logs ocorrem normalmente sem erros de rede

