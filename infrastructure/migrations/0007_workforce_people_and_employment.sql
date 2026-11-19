CREATE SCHEMA IF NOT EXISTS workforce;

-- 1. workforce.people (Pessoas físicas canônicas)
CREATE TABLE IF NOT EXISTS workforce.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  preferred_name text,
  document_ref text NOT NULL,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workforce_people_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_workforce_people_document_ref UNIQUE (tenant_id, document_ref),
  CONSTRAINT chk_workforce_people_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

ALTER TABLE workforce.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce.people FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'workforce' AND tablename = 'people' AND policyname = 'workforce_people_tenant_isolation'
  ) THEN
    CREATE POLICY workforce_people_tenant_isolation ON workforce.people
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_people_lookup 
  ON workforce.people (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_workforce_people_doc 
  ON workforce.people (tenant_id, document_ref);

-- 2. workforce.employees (Qualificação operacional no tenant)
CREATE TABLE IF NOT EXISTS workforce.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL,
  platform_account_status text NOT NULL DEFAULT 'UNLINKED',
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workforce_employees_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_workforce_employees_tenant_person UNIQUE (tenant_id, person_id),
  CONSTRAINT fk_workforce_employees_person FOREIGN KEY (tenant_id, person_id)
    REFERENCES workforce.people(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_workforce_employees_account_status CHECK (platform_account_status IN ('LINKED', 'UNLINKED')),
  CONSTRAINT chk_workforce_employees_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

ALTER TABLE workforce.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce.employees FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'workforce' AND tablename = 'employees' AND policyname = 'workforce_employees_tenant_isolation'
  ) THEN
    CREATE POLICY workforce_employees_tenant_isolation ON workforce.employees
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_employees_status 
  ON workforce.employees (tenant_id, status);

-- 3. workforce.company_employments (Vínculos empregatícios temporais com empresas clientes)
CREATE TABLE IF NOT EXISTS workforce.company_employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL,
  client_company_id uuid NOT NULL,
  external_employee_code text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workforce_employments_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_workforce_employments_employee FOREIGN KEY (tenant_id, employee_id)
    REFERENCES workforce.employees(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_workforce_employments_company FOREIGN KEY (tenant_id, client_company_id)
    REFERENCES crm.client_companies(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_workforce_employments_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'TERMINATED'))
);

ALTER TABLE workforce.company_employments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce.company_employments FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'workforce' AND tablename = 'company_employments' AND policyname = 'workforce_employments_tenant_isolation'
  ) THEN
    CREATE POLICY workforce_employments_tenant_isolation ON workforce.company_employments
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_employments_emp 
  ON workforce.company_employments (tenant_id, employee_id, valid_from, valid_to);

CREATE INDEX IF NOT EXISTS idx_workforce_employments_company 
  ON workforce.company_employments (tenant_id, client_company_id, status);

-- 4. workforce.provisional_transport_authorizations (Autorizações temporárias de embarque)
CREATE TABLE IF NOT EXISTS workforce.provisional_transport_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL,
  client_company_id uuid NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  completed_reason text,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workforce_prov_auth_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_workforce_prov_auth_employee FOREIGN KEY (tenant_id, employee_id)
    REFERENCES workforce.employees(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_workforce_prov_auth_company FOREIGN KEY (tenant_id, client_company_id)
    REFERENCES crm.client_companies(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_workforce_prov_auth_status CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED'))
);

ALTER TABLE workforce.provisional_transport_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce.provisional_transport_authorizations FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'workforce' AND tablename = 'provisional_transport_authorizations' AND policyname = 'workforce_prov_auth_tenant_isolation'
  ) THEN
    CREATE POLICY workforce_prov_auth_tenant_isolation ON workforce.provisional_transport_authorizations
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_prov_auth_lookup 
  ON workforce.provisional_transport_authorizations (tenant_id, client_company_id, status, valid_from, valid_to);

-- 5. Seed de Permissões RBAC para Workforce
INSERT INTO iam.permissions (code, resource, action, description)
VALUES
  ('workforce:read', 'workforce', 'read', 'Listar e visualizar dados de pessoas, colaboradores e vínculos'),
  ('workforce:write', 'workforce', 'write', 'Cadastrar e atualizar dados de pessoas, colaboradores e vínculos'),
  ('workforce:admin', 'workforce', 'admin', 'Gerenciar status e autorizações provisórias de colaboradores')
ON CONFLICT (code) DO NOTHING;
