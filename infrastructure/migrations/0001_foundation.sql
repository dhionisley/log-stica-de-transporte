BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS integration;

CREATE TABLE platform.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('PROVISIONED','ACTIVE','SUSPENDED','TERMINATED')),
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, id)
);

CREATE TABLE audit.audit_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  actor_type text NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  request_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integration.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  event_type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version bigint NOT NULL,
  correlation_id uuid,
  causation_id uuid,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE integration.inbox_messages (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  consumer text NOT NULL,
  message_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  result jsonb,
  PRIMARY KEY (tenant_id, consumer, message_id)
);

ALTER TABLE iam.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration.inbox_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users ON iam.users
USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
CREATE POLICY tenant_isolation_audit ON audit.audit_records
USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
CREATE POLICY tenant_isolation_outbox ON integration.outbox_events
USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
CREATE POLICY tenant_isolation_inbox ON integration.inbox_messages
USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);

CREATE INDEX outbox_unpublished_idx ON integration.outbox_events (occurred_at) WHERE published_at IS NULL;
CREATE INDEX audit_tenant_resource_idx ON audit.audit_records (tenant_id, resource_type, resource_id, occurred_at DESC);
COMMIT;
