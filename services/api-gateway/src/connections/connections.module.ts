import { Module } from '@nestjs/common';
import { IntegrationProviderModule } from '@agent-workflow/integration-provider';
import { ConnectionsController } from './connections.controller';
import { IntegrationFetcherService } from './integration-fetcher.service';

@Module({
  imports: [IntegrationProviderModule],
  controllers: [ConnectionsController],
  providers: [IntegrationFetcherService],
})
export class ConnectionsModule {}
