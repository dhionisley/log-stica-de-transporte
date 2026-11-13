ALTER TABLE platform.tenants
  ADD COLUMN IF NOT EXISTS commercial_name text,
  ADD COLUMN IF NOT EXISTS default_timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE TABLE IF NOT EXISTS platform.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_setting UNIQUE (tenant_id, setting_key)
);

ALTER TABLE platform.tenant_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'platform' AND tablename = 'tenant_settings' AND policyname = 'tenant_isolation_settings'
  ) THEN
    CREATE POLICY tenant_isolation_settings ON platform.tenant_settings
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform.tenant_branding (
  tenant_id uuid PRIMARY KEY REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  brand_name text NOT NULL,
  logo_asset_id text,
  primary_theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform.tenant_branding ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'platform' AND tablename = 'tenant_branding' AND policyname = 'tenant_isolation_branding'
  ) THEN
    CREATE POLICY tenant_isolation_branding ON platform.tenant_branding
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_settings_lookup ON platform.tenant_settings (tenant_id, setting_key);

