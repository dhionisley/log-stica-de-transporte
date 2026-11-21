# Spec Delta

## Purpose

Define os contratos comportamentais para o catálogo mestre de locais operacionais, bases e pontos de parada, com coordenadas geográficas WGS 84 e perímetros geofence para monitoramento espacial.

## ADDED Requirements

### Requirement: Cadastro de Locais Operacionais com Coordenadas Válidas
O sistema SHALL permitir o cadastro e atualização de locais operacionais associados a um tenant, registrando nome, tipo de local, endereço estruturado e coordenadas geográficas (latitude e longitude) validadas sob o padrão WGS 84.

#### Scenario: Cadastro bem-sucedido de local operacional
- **WHEN** um operador cadastra um local operacional com nome, tipo válido e coordenadas geográficas válidas
- **THEN** o sistema persiste o local com status `ACTIVE`, ponto espacial PostGIS e devolve HTTP 201

#### Scenario: Rejeição de coordenadas geográficas inválidas
- **WHEN** uma requisição submete latitude fora do intervalo [-90, 90] ou longitude fora de [-180, 180]
- **THEN** o sistema recusa a operação com erro de validação HTTP 400

### Requirement: Definição e Validação de Perímetros de Geofence
O sistema SHALL permitir associar a um local operacional uma geofence poligonal ou raio circular em metros, validando que polígonos constituam anéis fechados com pelo menos quatro vértices.

#### Scenario: Configuração válida de geofence poligonal
- **WHEN** um operador define uma cerca eletrônica poligonal com primeiro e último vértices coincidentes
- **THEN** o sistema calcula e armazena a geometria espacial correspondente com status válido

#### Scenario: Rejeição de polígono não fechado
- **WHEN** uma requisição submete um conjunto de vértices de polígono cujo vértice final não coincide com o inicial
- **THEN** o sistema rejeita a geofence com erro de validação HTTP 400

### Requirement: Avaliação de Contenção de Ponto na Geofence
O sistema SHALL fornecer serviço espacial para verificar se uma determinada coordenada geográfica de um veículo ou passageiro está localizada no interior do perímetro da geofence do local.

#### Scenario: Ponto localizado dentro da geofence
- **WHEN** é consultada a presença de uma coordenada geográfica situada dentro do perímetro do local
- **THEN** o sistema confirma a contenção indicando que o ponto está dentro da geofence

#### Scenario: Ponto localizado fora da geofence
- **WHEN** é consultada a presença de uma coordenada geográfica situada além do perímetro do local
- **THEN** o sistema informa que o ponto está fora da geofence

### Requirement: Isolamento Multitenant e Vínculo com Empresa Cliente
O sistema SHALL garantir isolamento estrito de locais operacionais por tenant via RLS, permitindo associar opcionalmente o local a uma empresa cliente cadastrada no mesmo tenant.

#### Scenario: Isolamento entre tenants distintos
- **WHEN** um operador consulta locais operacionais sob o contexto do seu tenant
- **THEN** o sistema retorna exclusivamente locais pertencentes ao tenant autenticado

#### Scenario: Rejeição de vínculo com empresa cliente de outro tenant
- **WHEN** um operador tenta associar um local a uma empresa cliente não pertencente ao seu tenant
- **THEN** o sistema bloqueia a associação com erro HTTP 404 ou 400

### Requirement: Publicação Confiável no Outbox e Auditoria Imutável
O sistema SHALL publicar eventos no Transactional Outbox e registrar entradas imutáveis de auditoria em `audit.audit_records` para criação, alteração e atualização de geofences de locais operacionais.

#### Scenario: Publicação atômica em transação de banco de dados
- **WHEN** um local operacional é criado ou atualizado
- **THEN** o sistema grava na mesma transação o evento no Transactional Outbox e o registro de auditoria
