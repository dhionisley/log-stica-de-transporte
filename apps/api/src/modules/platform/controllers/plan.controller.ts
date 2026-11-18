import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Pool } from 'pg';
import { Inject } from '@nestjs/common';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresPlanRepository } from '../infrastructure/postgres-subscription.repository';

@Controller('platform/plans')
export class PlanController {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly planRepo: PostgresPlanRepository,
  ) {}

  @Get()
  async listActivePlans() {
    const client = await this.pool.connect();
    try {
      const plans = await this.planRepo.listActive(client);
      return plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        status: p.status,
        features: Object.fromEntries(p.features),
      }));
    } finally {
      client.release();
    }
  }

  @Get(':code')
  async getPlanByCode(@Param('code') code: string) {
    const client = await this.pool.connect();
    try {
      const plan = await this.planRepo.findByCode(client, code);
      if (!plan) {
        throw new NotFoundException(`Plan with code "${code}" not found`);
      }
      return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        status: plan.status,
        features: Object.fromEntries(plan.features),
      };
    } finally {
      client.release();
    }
  }
}

