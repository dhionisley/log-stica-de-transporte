CREATE SCHEMA IF NOT EXISTS service;

-- 1. service.service_locations (Locais operacionais, bases, pontos de parada e geofences)
CREATE TABLE IF NOT EXISTS service.service_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  client_company_id uuid,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'CLIENT_SITE',
  address_structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  point geography(Point, 4326) NOT NULL,
  geofence geography(Polygon, 4326),
  geofence_radius_meters integer,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_service_locations_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_service_locations_company FOREIGN KEY (tenant_id, client_company_id)
    REFERENCES crm.client_companies(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT chk_service_locations_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT chk_service_locations_type CHECK (location_type IN ('CLIENT_SITE', 'OPERATIONAL_BASE', 'STOP_POINT', 'PASSENGER_PICKUP')),
  CONSTRAINT chk_service_locations_radius CHECK (geofence_radius_meters IS NULL OR geofence_radius_meters > 0)
);

ALTER TABLE service.service_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE service.service_locations FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'service' AND tablename = 'service_locations' AND policyname = 'service_locations_tenant_isolation'
  ) THEN
    CREATE POLICY service_locations_tenant_isolation ON service.service_locations
      USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_locations_point 
  ON service.service_locations USING GIST (point);

CREATE INDEX IF NOT EXISTS idx_service_locations_geofence 
  ON service.service_locations USING GIST (geofence);

CREATE INDEX IF NOT EXISTS idx_service_locations_tenant_status 
  ON service.service_locations (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_service_locations_client 
  ON service.service_locations (tenant_id, client_company_id);

-- 2. Seed de Permissões RBAC para Locais e Geofences
INSERT INTO iam.permissions (code, resource, action, description)
VALUES
  ('locations:read', 'locations', 'read', 'Listar e visualizar locais operacionais e geofences'),
  ('locations:write', 'locations', 'write', 'Cadastrar e atualizar locais operacionais e perímetros'),
  ('locations:admin', 'locations', 'admin', 'Gerenciar status e configurações avançadas de geofence')
ON CONFLICT (code) DO NOTHING;
