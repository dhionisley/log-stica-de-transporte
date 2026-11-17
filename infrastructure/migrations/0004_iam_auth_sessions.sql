-- Migration: 0004_iam_auth_sessions.sql
-- Credenciais locais com hashing scrypt, sessões revogáveis e autenticação multifator (MFA TOTP) com RLS

-- 1. Credenciais de autenticação local (iam.user_credentials)
CREATE TABLE IF NOT EXISTS iam.user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  algorithm text NOT NULL DEFAULT 'scrypt',
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  params jsonb NOT NULL DEFAULT '{"N": 16384, "r": 8, "p": 1}'::jsonb,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_credential UNIQUE (tenant_id, user_id),
  CONSTRAINT fk_user_credentials_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES iam.users(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE iam.user_credentials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'iam' AND tablename = 'user_credentials' AND policyname = 'tenant_isolation_user_credentials'
  ) THEN
    CREATE POLICY tenant_isolation_user_credentials ON iam.user_credentials
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

-- 2. Sessões revogáveis (iam.sessions)
CREATE TABLE IF NOT EXISTS iam.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  device_id text,
  device_name text,
  ip_address text,
  user_agent text,
  refresh_token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sessions_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES iam.users(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE iam.sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'iam' AND tablename = 'sessions' AND policyname = 'tenant_isolation_sessions'
  ) THEN
    CREATE POLICY tenant_isolation_sessions ON iam.sessions
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_iam_sessions_active
  ON iam.sessions (tenant_id, user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_iam_sessions_refresh_hash
  ON iam.sessions (tenant_id, refresh_token_hash);

-- 3. Métodos de autenticação multifator (iam.mfa_methods)
CREATE TABLE IF NOT EXISTS iam.mfa_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  method_type text NOT NULL CHECK (method_type IN ('TOTP', 'BACKUP_CODES')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),
  secret_encrypted text,
  backup_codes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mfa_methods_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES iam.users(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_user_mfa_method UNIQUE (tenant_id, user_id, method_type)
);

ALTER TABLE iam.mfa_methods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'iam' AND tablename = 'mfa_methods' AND policyname = 'tenant_isolation_mfa_methods'
  ) THEN
    CREATE POLICY tenant_isolation_mfa_methods ON iam.mfa_methods
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_iam_mfa_active
  ON iam.mfa_methods (tenant_id, user_id, method_type)
  WHERE status = 'ACTIVE';

