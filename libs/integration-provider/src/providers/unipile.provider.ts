import { Injectable, Logger } from '@nestjs/common';
import {
  IIntegrationProvider,
  ToolDefinition,
  ConnectionCheckResult,
  ActionExecutionResult,
} from '../provider.interface';

@Injectable()
export class UnipileProvider implements IIntegrationProvider {
  readonly providerType = 'UNIPILE';
  private readonly logger = new Logger(UnipileProvider.name);

  async listTools(): Promise<ToolDefinition[]> {
    this.logger.log('Unipile listTools not yet implemented');
    return [];
  }

  async checkConnection(
    _baseUrl: string,
    _apiKey: string,
    _connectionId: string,
    integrationKey: string,
  ): Promise<ConnectionCheckResult> {
    this.logger.log('Unipile checkConnection not yet implemented');
    return { connected: false, integrationKey, error: 'Unipile not yet implemented' };
  }

  async executeAction(): Promise<ActionExecutionResult> {
    this.logger.log('Unipile executeAction not yet implemented');
    return { success: false, error: 'Unipile not yet implemented' };
  }
}
