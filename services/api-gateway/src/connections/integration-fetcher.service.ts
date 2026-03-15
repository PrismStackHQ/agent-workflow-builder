import { Injectable, Logger } from '@nestjs/common';

interface NormalizedIntegration {
  providerConfigKey: string;
  displayName: string;
  logoUrl: string | null;
  rawMetadata: Record<string, any>;
}

@Injectable()
export class IntegrationFetcherService {
  private readonly logger = new Logger(IntegrationFetcherService.name);

  async fetchIntegrations(
    provider: string,
    endpointUrl: string,
    apiKey: string,
  ): Promise<NormalizedIntegration[]> {
    switch (provider) {
      case 'NANGO':
        return this.fetchNango(endpointUrl, apiKey);
      case 'UNIPILE':
        return this.fetchUnipile(endpointUrl, apiKey);
      case 'MERGE':
        return this.fetchMerge(endpointUrl, apiKey);
      default:
        this.logger.warn(`Unknown provider: ${provider}`);
        return [];
    }
  }

  private async fetchNango(
    endpointUrl: string,
    apiKey: string,
  ): Promise<NormalizedIntegration[]> {
    const res = await fetch(endpointUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Nango API error: ${res.status} ${res.statusText}`);
    }

    const body: any = await res.json();
    const items: any[] = body.data || [];

    return items.map((item) => ({
      providerConfigKey: item.unique_key,
      displayName: item.display_name || item.unique_key,
      logoUrl: item.logo || null,
      rawMetadata: item,
    }));
  }

  private async fetchUnipile(
    _endpointUrl: string,
    _apiKey: string,
  ): Promise<NormalizedIntegration[]> {
    this.logger.log('Unipile integration fetch not yet implemented');
    return [];
  }

  private async fetchMerge(
    _endpointUrl: string,
    _apiKey: string,
  ): Promise<NormalizedIntegration[]> {
    this.logger.log('Merge integration fetch not yet implemented');
    return [];
  }
}
