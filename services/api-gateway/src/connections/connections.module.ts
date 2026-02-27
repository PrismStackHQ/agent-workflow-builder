import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { IntegrationFetcherService } from './integration-fetcher.service';

@Module({
  controllers: [ConnectionsController],
  providers: [IntegrationFetcherService],
})
export class ConnectionsModule {}
