CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE IF NOT EXISTS crm.client_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  commercial_name text NOT NULL,
  tax_id text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_contact_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_crm_client_companies_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_crm_client_companies_tax_id UNIQUE (tenant_id, tax_id),
  CONSTRAINT chk_crm_client_companies_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED'))
);

ALTER TABLE crm.client_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.client_companies FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'crm' AND tablename = 'client_companies' AND policyname = 'crm_client_companies_tenant_isolation'
  ) THEN
    CREATE POLICY crm_client_companies_tenant_isolation ON crm.client_companies
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_client_companies_lookup 
  ON crm.client_companies (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_crm_client_companies_tax_id 
  ON crm.client_companies (tenant_id, tax_id);

CREATE INDEX IF NOT EXISTS idx_crm_client_companies_legal_name 
  ON crm.client_companies (tenant_id, legal_name);

CREATE TABLE IF NOT EXISTS crm.company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_within_company text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_crm_company_users UNIQUE (tenant_id, client_company_id, user_id),
  CONSTRAINT fk_crm_company_users_company FOREIGN KEY (tenant_id, client_company_id) 
    REFERENCES crm.client_companies(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_company_users_user FOREIGN KEY (tenant_id, user_id) 
    REFERENCES iam.users(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT chk_crm_company_users_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

ALTER TABLE crm.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.company_users FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'crm' AND tablename = 'company_users' AND policyname = 'crm_company_users_tenant_isolation'
  ) THEN
    CREATE POLICY crm_company_users_tenant_isolation ON crm.company_users
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_company_users_user 
  ON crm.company_users (tenant_id, user_id);

INSERT INTO iam.permissions (code, resource, action, description)
VALUES
  ('clients:read', 'client_company', 'read', 'Listar e visualizar dados de empresas clientes'),
  ('clients:write', 'client_company', 'write', 'Cadastrar e atualizar dados de empresas clientes'),
  ('clients:admin', 'client_company', 'admin', 'Gerenciar status e bloqueios operacionais de empresas clientes')
ON CONFLICT (code) DO NOTHING;

