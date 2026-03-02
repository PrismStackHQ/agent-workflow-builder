import { Module } from '@nestjs/common';
import { PrismaModule } from '@agent-workflow/prisma-client';
import { NangoProvider } from './providers/nango.provider';
import { UnipileProvider } from './providers/unipile.provider';
import { MergeProvider } from './providers/merge.provider';
import { ProviderFactory } from './provider-factory.service';
import { ToolRegistryService } from './tool-registry.service';
import { ProviderExecutorService } from './provider-executor.service';
import { ProxyActionRegistry } from './proxy/proxy-action.registry';

@Module({
  imports: [PrismaModule],
  providers: [
    NangoProvider,
    UnipileProvider,
    MergeProvider,
    ProviderFactory,
    ToolRegistryService,
    ProviderExecutorService,
    ProxyActionRegistry,
  ],
  exports: [
    ProviderFactory,
    ToolRegistryService,
    ProviderExecutorService,
    ProxyActionRegistry,
  ],
})
export class IntegrationProviderModule {}
