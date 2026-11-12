DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'transport_rls_test') THEN
    CREATE ROLE transport_rls_test NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA platform, iam, audit, integration TO transport_rls_test;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA platform, iam, audit, integration
  TO transport_rls_test;
