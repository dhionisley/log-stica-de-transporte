-- Migration: 0005_plans_and_entitlements.sql
-- Catálogo global de planos, funcionalidades/limites e assinaturas tenant-scoped com RLS

-- 1. Catálogo global de planos (platform.plans)
CREATE TABLE IF NOT EXISTS platform.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Funcionalidades e limites por plano (platform.plan_features)
CREATE TABLE IF NOT EXISTS platform.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES platform.plans(id) ON DELETE CASCADE,
  feature_code text NOT NULL,
  limit_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_plan_feature UNIQUE (plan_id, feature_code)
);

CREATE INDEX IF NOT EXISTS idx_plan_features_lookup
  ON platform.plan_features (plan_id, feature_code);

-- 3. Assinaturas de tenants (platform.subscriptions)
CREATE TABLE IF NOT EXISTS platform.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES platform.plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  custom_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_subscription_id UNIQUE (tenant_id, id)
);

ALTER TABLE platform.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'platform' AND tablename = 'subscriptions' AND policyname = 'tenant_isolation_subscriptions'
  ) THEN
    CREATE POLICY tenant_isolation_subscriptions ON platform.subscriptions
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_active
  ON platform.subscriptions (tenant_id, status)
  WHERE status = 'ACTIVE';

-- 4. Seeds do catálogo global de planos
INSERT INTO platform.plans (code, name, description, status)
VALUES
  ('STARTER', 'Plano Starter', 'Plano inicial para pequenas frotas e operações locais', 'ACTIVE'),
  ('PROFESSIONAL', 'Plano Professional', 'Plano avançado para médias empresas com rastreamento e otimização', 'ACTIVE'),
  ('ENTERPRISE', 'Plano Enterprise', 'Plano corporativo sem limites para grandes operadores de transporte', 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- Seeds de funcionalidades para cada plano
DO $$
DECLARE
  v_starter_id uuid;
  v_pro_id uuid;
  v_enterprise_id uuid;
BEGIN
  SELECT id INTO v_starter_id FROM platform.plans WHERE code = 'STARTER';
  SELECT id INTO v_pro_id FROM platform.plans WHERE code = 'PROFESSIONAL';
  SELECT id INTO v_enterprise_id FROM platform.plans WHERE code = 'ENTERPRISE';

  -- STARTER features
  INSERT INTO platform.plan_features (plan_id, feature_code, limit_value)
  VALUES
    (v_starter_id, 'max_vehicles', '{"enabled": true, "max": 5}'::jsonb),
    (v_starter_id, 'max_drivers', '{"enabled": true, "max": 10}'::jsonb),
    (v_starter_id, 'max_monthly_trips', '{"enabled": true, "max": 200}'::jsonb),
    (v_starter_id, 'realtime_tracking', '{"enabled": false}'::jsonb),
    (v_starter_id, 'optimization_engine', '{"enabled": false}'::jsonb),
    (v_starter_id, 'custom_branding', '{"enabled": false}'::jsonb)
  ON CONFLICT (plan_id, feature_code) DO NOTHING;

  -- PROFESSIONAL features
  INSERT INTO platform.plan_features (plan_id, feature_code, limit_value)
  VALUES
    (v_pro_id, 'max_vehicles', '{"enabled": true, "max": 25}'::jsonb),
    (v_pro_id, 'max_drivers', '{"enabled": true, "max": 50}'::jsonb),
    (v_pro_id, 'max_monthly_trips', '{"enabled": true, "max": 1500}'::jsonb),
    (v_pro_id, 'realtime_tracking', '{"enabled": true}'::jsonb),
    (v_pro_id, 'optimization_engine', '{"enabled": true}'::jsonb),
    (v_pro_id, 'custom_branding', '{"enabled": true}'::jsonb)
  ON CONFLICT (plan_id, feature_code) DO NOTHING;

  -- ENTERPRISE features
  INSERT INTO platform.plan_features (plan_id, feature_code, limit_value)
  VALUES
    (v_enterprise_id, 'max_vehicles', '{"enabled": true, "max": -1}'::jsonb),
    (v_enterprise_id, 'max_drivers', '{"enabled": true, "max": -1}'::jsonb),
    (v_enterprise_id, 'max_monthly_trips', '{"enabled": true, "max": -1}'::jsonb),
    (v_enterprise_id, 'realtime_tracking', '{"enabled": true}'::jsonb),
    (v_enterprise_id, 'optimization_engine', '{"enabled": true}'::jsonb),
    (v_enterprise_id, 'custom_branding', '{"enabled": true}'::jsonb)
  ON CONFLICT (plan_id, feature_code) DO NOTHING;

  -- Backfill: associa tenants existentes sem assinatura ao plano PROFESSIONAL
  INSERT INTO platform.subscriptions (tenant_id, plan_id, status, starts_at)
  SELECT t.id, v_pro_id, 'ACTIVE', now()
  FROM platform.tenants t
  WHERE NOT EXISTS (
    SELECT 1 FROM platform.subscriptions s WHERE s.tenant_id = t.id
  )
  ON CONFLICT DO NOTHING;
END $$;

