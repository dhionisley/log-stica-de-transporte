-- Migration: 0003_iam_rbac.sql
-- Enriquecimento de usuários, catálogo global de permissões e perfis de permissão tenant-scoped (RBAC) com RLS

-- 1. Enriquecimento de iam.users
ALTER TABLE iam.users
  ADD COLUMN IF NOT EXISTS email_normalized text,
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE iam.users
SET email_normalized = lower(trim(email))
WHERE email_normalized IS NULL;

ALTER TABLE iam.users
  ALTER COLUMN email_normalized SET NOT NULL;

-- Garante suporte a metadata em audit_records
ALTER TABLE audit.audit_records
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 2. Catálogo global de permissões
CREATE TABLE IF NOT EXISTS iam.permissions (
  code text PRIMARY KEY,
  resource text NOT NULL,
  action text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed básico do catálogo global
INSERT INTO iam.permissions (code, resource, action, description)
VALUES
  ('tenant:read', 'tenant', 'read', 'Visualizar informações do tenant'),
  ('tenant:update', 'tenant', 'update', 'Atualizar dados cadastrais do tenant'),
  ('tenant:settings:manage', 'tenant_settings', 'manage', 'Gerenciar configurações e branding do tenant'),
  ('iam:user:read', 'user', 'read', 'Listar e consultar usuários do tenant'),
  ('iam:user:create', 'user', 'create', 'Cadastrar novo usuário no tenant'),
  ('iam:user:update', 'user', 'update', 'Alterar dados de usuário do tenant'),
  ('iam:user:assign_profile', 'user', 'assign_profile', 'Atribuir perfis de acesso a usuários'),
  ('iam:profile:read', 'permission_profile', 'read', 'Listar e consultar perfis de permissão'),
  ('iam:profile:create', 'permission_profile', 'create', 'Criar novo perfil de permissão'),
  ('iam:profile:update', 'permission_profile', 'update', 'Alterar perfil de permissão e suas atribuições'),
  ('audit:read', 'audit', 'read', 'Consultar trilhas de auditoria do tenant')
ON CONFLICT (code) DO NOTHING;

-- 3. Perfis de permissão tenant-scoped
CREATE TABLE IF NOT EXISTS iam.permission_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  profile_type text NOT NULL DEFAULT 'CUSTOM',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_profile_name UNIQUE (tenant_id, name),
  CONSTRAINT uq_tenant_profile_id UNIQUE (tenant_id, id)
);

ALTER TABLE iam.permission_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'iam' AND tablename = 'permission_profiles' AND policyname = 'tenant_isolation_permission_profiles'
  ) THEN
    CREATE POLICY tenant_isolation_permission_profiles ON iam.permission_profiles
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

-- 4. Associação de permissões a perfis
CREATE TABLE IF NOT EXISTS iam.permission_profile_permissions (
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  permission_code text NOT NULL REFERENCES iam.permissions(code) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, profile_id, permission_code),
  CONSTRAINT fk_profile_permissions_profile FOREIGN KEY (tenant_id, profile_id) 
    REFERENCES iam.permission_profiles(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE iam.permission_profile_permissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'iam' AND tablename = 'permission_profile_permissions' AND policyname = 'tenant_isolation_profile_permissions'
  ) THEN
    CREATE POLICY tenant_isolation_profile_permissions ON iam.permission_profile_permissions
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

-- 5. Atribuição de perfis a usuários
CREATE TABLE IF NOT EXISTS iam.user_profile_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_assignment_user FOREIGN KEY (tenant_id, user_id) 
    REFERENCES iam.users(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_assignment_profile FOREIGN KEY (tenant_id, profile_id) 
    REFERENCES iam.permission_profiles(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_user_profile_assignment UNIQUE (tenant_id, user_id, profile_id)
);

ALTER TABLE iam.user_profile_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'iam' AND tablename = 'user_profile_assignments' AND policyname = 'tenant_isolation_user_profile_assignments'
  ) THEN
    CREATE POLICY tenant_isolation_user_profile_assignments ON iam.user_profile_assignments
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

-- Índices para resolução rápida de autorização contextual
CREATE INDEX IF NOT EXISTS idx_user_assignments_active 
  ON iam.user_profile_assignments (tenant_id, user_id, profile_id) 
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_permissions_lookup 
  ON iam.permission_profile_permissions (tenant_id, profile_id, permission_code);

