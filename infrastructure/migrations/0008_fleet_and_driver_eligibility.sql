CREATE SCHEMA IF NOT EXISTS fleet;

-- 1. fleet.vehicles (Veículos da frota operacional)
CREATE TABLE IF NOT EXISTS fleet.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  fleet_code text NOT NULL,
  plate text NOT NULL,
  plate_normalized text NOT NULL,
  category text NOT NULL DEFAULT 'BUS',
  capacity integer NOT NULL,
  accessibility_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  odometer_km integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  operational_status text NOT NULL DEFAULT 'AVAILABLE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fleet_vehicles_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_fleet_vehicles_plate_normalized UNIQUE (tenant_id, plate_normalized),
  CONSTRAINT uq_fleet_vehicles_fleet_code UNIQUE (tenant_id, fleet_code),
  CONSTRAINT chk_fleet_vehicles_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT chk_fleet_vehicles_operational_status CHECK (operational_status IN ('AVAILABLE', 'IN_MAINTENANCE', 'OUT_OF_SERVICE')),
  CONSTRAINT chk_fleet_vehicles_category CHECK (category IN ('CAR', 'VAN', 'MINIBUS', 'BUS')),
  CONSTRAINT chk_fleet_vehicles_capacity CHECK (capacity > 0)
);

ALTER TABLE fleet.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.vehicles FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'fleet' AND tablename = 'vehicles' AND policyname = 'fleet_vehicles_tenant_isolation'
  ) THEN
    CREATE POLICY fleet_vehicles_tenant_isolation ON fleet.vehicles
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_status 
  ON fleet.vehicles (tenant_id, status, operational_status);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_plate 
  ON fleet.vehicles (tenant_id, plate_normalized);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_code 
  ON fleet.vehicles (tenant_id, fleet_code);

-- 2. fleet.vehicle_documents (Documentos regulatórios e de conformidade veicular)
CREATE TABLE IF NOT EXISTS fleet.vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL,
  document_type text NOT NULL,
  document_number text NOT NULL,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'VALID',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fleet_vehicle_documents_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_fleet_vehicle_documents_vehicle FOREIGN KEY (tenant_id, vehicle_id)
    REFERENCES fleet.vehicles(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT chk_fleet_vehicle_documents_status CHECK (status IN ('VALID', 'EXPIRED', 'PENDING'))
);

ALTER TABLE fleet.vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.vehicle_documents FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'fleet' AND tablename = 'vehicle_documents' AND policyname = 'fleet_vehicle_documents_tenant_isolation'
  ) THEN
    CREATE POLICY fleet_vehicle_documents_tenant_isolation ON fleet.vehicle_documents
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_docs_vehicle 
  ON fleet.vehicle_documents (tenant_id, vehicle_id, document_type);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_docs_expiry 
  ON fleet.vehicle_documents (tenant_id, expires_at);

-- 3. workforce.drivers (Condutores habilitados vinculados à pessoa física)
CREATE TABLE IF NOT EXISTS workforce.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL,
  license_number text NOT NULL,
  license_category text NOT NULL,
  license_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  suspension_reason text,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workforce_drivers_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_workforce_drivers_tenant_person UNIQUE (tenant_id, person_id),
  CONSTRAINT uq_workforce_drivers_license UNIQUE (tenant_id, license_number),
  CONSTRAINT fk_workforce_drivers_person FOREIGN KEY (tenant_id, person_id)
    REFERENCES workforce.people(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_workforce_drivers_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  CONSTRAINT chk_workforce_drivers_category CHECK (license_category IN ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'))
);

ALTER TABLE workforce.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce.drivers FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'workforce' AND tablename = 'drivers' AND policyname = 'workforce_drivers_tenant_isolation'
  ) THEN
    CREATE POLICY workforce_drivers_tenant_isolation ON workforce.drivers
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_drivers_status 
  ON workforce.drivers (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_workforce_drivers_license_expiry 
  ON workforce.drivers (tenant_id, license_expires_at);

-- 4. workforce.driver_documents (Documentos de condutores como CNH, toxicológico e certidões)
CREATE TABLE IF NOT EXISTS workforce.driver_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL,
  document_type text NOT NULL,
  document_number text NOT NULL,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'VALID',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workforce_driver_documents_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_workforce_driver_documents_driver FOREIGN KEY (tenant_id, driver_id)
    REFERENCES workforce.drivers(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT chk_workforce_driver_documents_status CHECK (status IN ('VALID', 'EXPIRED', 'PENDING'))
);

ALTER TABLE workforce.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce.driver_documents FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'workforce' AND tablename = 'driver_documents' AND policyname = 'workforce_driver_documents_tenant_isolation'
  ) THEN
    CREATE POLICY workforce_driver_documents_tenant_isolation ON workforce.driver_documents
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_driver_docs_driver 
  ON workforce.driver_documents (tenant_id, driver_id, document_type);

CREATE INDEX IF NOT EXISTS idx_workforce_driver_docs_expiry 
  ON workforce.driver_documents (tenant_id, expires_at);

-- 5. workforce.driver_eligibilities (Histórico e avaliações de elegibilidade de condutores)
CREATE TABLE IF NOT EXISTS workforce.driver_eligibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  is_eligible boolean NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workforce_driver_eligibilities_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_workforce_driver_eligibilities_driver FOREIGN KEY (tenant_id, driver_id)
    REFERENCES workforce.drivers(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE workforce.driver_eligibilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce.driver_eligibilities FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'workforce' AND tablename = 'driver_eligibilities' AND policyname = 'workforce_driver_eligibilities_tenant_isolation'
  ) THEN
    CREATE POLICY workforce_driver_eligibilities_tenant_isolation ON workforce.driver_eligibilities
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_driver_eligibilities_eval 
  ON workforce.driver_eligibilities (tenant_id, driver_id, evaluated_at DESC);

-- 6. Seed de Permissões RBAC para Frota e Condutores
INSERT INTO iam.permissions (code, resource, action, description)
VALUES
  ('fleet:read', 'fleet', 'read', 'Listar e visualizar veículos e documentação da frota'),
  ('fleet:write', 'fleet', 'write', 'Cadastrar e atualizar veículos e documentos da frota'),
  ('fleet:admin', 'fleet', 'admin', 'Gerenciar status operacional e manutenções da frota'),
  ('workforce:driver:read', 'workforce', 'driver_read', 'Listar e visualizar dados de motoristas e habilitações'),
  ('workforce:driver:write', 'workforce', 'driver_write', 'Cadastrar, qualificar e suspender motoristas')
ON CONFLICT (code) DO NOTHING;
