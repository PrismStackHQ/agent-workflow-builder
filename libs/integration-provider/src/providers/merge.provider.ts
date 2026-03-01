import { Injectable, Logger } from '@nestjs/common';
import {
  IIntegrationProvider,
  ToolDefinition,
  ConnectionCheckResult,
  ActionExecutionResult,
  ProviderConnection,
} from '../provider.interface';

@Injectable()
export class MergeProvider implements IIntegrationProvider {
  readonly providerType = 'MERGE';
  private readonly logger = new Logger(MergeProvider.name);

  async listTools(): Promise<ToolDefinition[]> {
    this.logger.log('Merge listTools not yet implemented');
    return [];
  }

  async listConnections(): Promise<ProviderConnection[]> {
    this.logger.log('Merge listConnections not yet implemented');
    return [];
  }

  async checkConnection(
    _baseUrl: string,
    _apiKey: string,
    _connectionId: string,
    integrationKey: string,
  ): Promise<ConnectionCheckResult> {
    this.logger.log('Merge checkConnection not yet implemented');
    return { connected: false, integrationKey, error: 'Merge not yet implemented' };
  }

  async executeAction(): Promise<ActionExecutionResult> {
    this.logger.log('Merge executeAction not yet implemented');
    return { success: false, error: 'Merge not yet implemented' };
  }
}
