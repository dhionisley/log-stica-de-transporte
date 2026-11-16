import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';

@Injectable()
export class AuthorizationService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async hasPermission(
    tenantId: string,
    userId: string,
    permissionCode: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

      const res = await client.query<{ has_permission: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM iam.user_profile_assignments upa
           JOIN iam.permission_profiles pp 
             ON pp.tenant_id = upa.tenant_id AND pp.id = upa.profile_id
           JOIN iam.permission_profile_permissions ppp 
             ON ppp.tenant_id = pp.tenant_id AND ppp.profile_id = pp.id
           WHERE upa.tenant_id = $1
             AND upa.user_id = $2
             AND ppp.permission_code = $3
             AND pp.status = 'ACTIVE'
             AND upa.effective_from <= now()
             AND (upa.effective_to IS NULL OR upa.effective_to > now())
         ) AS has_permission`,
        [tenantId, userId, permissionCode],
      );

      return Boolean(res.rows[0]?.has_permission);
    } finally {
      client.release();
    }
  }

  async getUserPermissions(tenantId: string, userId: string): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

      const res = await client.query<{ permission_code: string }>(
        `SELECT DISTINCT ppp.permission_code
         FROM iam.user_profile_assignments upa
         JOIN iam.permission_profiles pp 
           ON pp.tenant_id = upa.tenant_id AND pp.id = upa.profile_id
         JOIN iam.permission_profile_permissions ppp 
           ON ppp.tenant_id = pp.tenant_id AND ppp.profile_id = pp.id
         WHERE upa.tenant_id = $1
           AND upa.user_id = $2
           AND pp.status = 'ACTIVE'
           AND upa.effective_from <= now()
           AND (upa.effective_to IS NULL OR upa.effective_to > now())
         ORDER BY ppp.permission_code ASC`,
        [tenantId, userId],
      );

      return res.rows.map((r) => r.permission_code);
    } finally {
      client.release();
    }
  }
}

