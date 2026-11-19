import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ClientCompanyController } from './controllers/client-company.controller';
import { ClientCompanyManagementService } from './application/client-company-management.service';
import { PostgresClientCompanyRepository } from './infrastructure/postgres-client-company.repository';
import { CLIENT_COMPANY_REPOSITORY_TOKEN } from './domain/client-company.repository';

@Module({
  imports: [DatabaseModule, OutboxModule],
  controllers: [ClientCompanyController],
  providers: [
    PostgresClientCompanyRepository,
    {
      provide: CLIENT_COMPANY_REPOSITORY_TOKEN,
      useExisting: PostgresClientCompanyRepository,
    },
    ClientCompanyManagementService,
  ],
  exports: [ClientCompanyManagementService, CLIENT_COMPANY_REPOSITORY_TOKEN],
})
export class ClientsModule {}