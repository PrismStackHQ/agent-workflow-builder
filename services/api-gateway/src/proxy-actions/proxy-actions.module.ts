import { Module } from '@nestjs/common';
import { IntegrationProviderModule } from '@agent-workflow/integration-provider';
import { ProxyActionsController } from './proxy-actions.controller';
import { ProxyActionsService } from './proxy-actions.service';

@Module({
  imports: [IntegrationProviderModule],
  controllers: [ProxyActionsController],
  providers: [ProxyActionsService],
})
export class ProxyActionsModule {}
