import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type { ConnectionTokensRequest } from '@agent-workflow/shared-types';
import { TokenFetcherService } from './token-fetcher.service';

@Injectable()
export class ConnectionHandler implements OnModuleInit {
  private readonly logger = new Logger(ConnectionHandler.name);

  constructor(
    private readonly nats: NatsService,
    private readonly tokenFetcher: TokenFetcherService,
  ) {}

  async onModuleInit() {
    await this.nats.handleRequest<ConnectionTokensRequest, any>(
      SUBJECTS.CONNECTION_TOKENS_REQUEST,
      async (data) => {
        this.logger.log(`Token request for workspace ${data.workspaceId}, ref ${data.connectionRefId}`);
        try {
          return await this.tokenFetcher.fetchTokens(data.workspaceId, data.connectionRefId);
        } catch (err) {
          return { error: String(err) };
        }
      },
    );

    this.logger.log('Connection handler initialized');
  }
}
