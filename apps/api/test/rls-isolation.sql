-- Execute after 0001_foundation.sql as a non-superuser/non-owner application role in production-like tests.
BEGIN;
INSERT INTO platform.tenants(id,slug,legal_name,status) VALUES
('00000000-0000-0000-0000-000000000001','tenant-a','Tenant A','ACTIVE'),
('00000000-0000-0000-0000-000000000002','tenant-b','Tenant B','ACTIVE')
ON CONFLICT DO NOTHING;

SELECT set_config('app.tenant_id','00000000-0000-0000-0000-000000000001',true);
INSERT INTO iam.users(id,tenant_id,email) VALUES
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','a@example.test')
ON CONFLICT DO NOTHING;

SELECT set_config('app.tenant_id','00000000-0000-0000-0000-000000000002',true);
INSERT INTO iam.users(id,tenant_id,email) VALUES
('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','b@example.test')
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
SELECT set_config('app.tenant_id','00000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE c int;
BEGIN
 SELECT count(*) INTO c FROM iam.users WHERE id='20000000-0000-0000-0000-000000000002';
 IF c <> 0 THEN RAISE EXCEPTION 'RLS isolation failure: Tenant A can see Tenant B'; END IF;
END $$;
ROLLBACK;
