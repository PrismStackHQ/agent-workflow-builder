import { Injectable } from '@nestjs/common';
import { IIntegrationProvider } from './provider.interface';
import { NangoProvider } from './providers/nango.provider';
import { UnipileProvider } from './providers/unipile.provider';
import { MergeProvider } from './providers/merge.provider';

@Injectable()
export class ProviderFactory {
  constructor(
    private readonly nangoProvider: NangoProvider,
    private readonly unipileProvider: UnipileProvider,
    private readonly mergeProvider: MergeProvider,
  ) {}

  getProvider(providerType: string): IIntegrationProvider {
    switch (providerType) {
      case 'NANGO':
        return this.nangoProvider;
      case 'UNIPILE':
        return this.unipileProvider;
      case 'MERGE':
        return this.mergeProvider;
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }
}
