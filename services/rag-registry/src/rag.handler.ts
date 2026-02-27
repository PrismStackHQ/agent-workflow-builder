import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type { RagQueryRequest } from '@agent-workflow/shared-types';
import { RagService } from './rag.service';

@Injectable()
export class RagHandler implements OnModuleInit {
  private readonly logger = new Logger(RagHandler.name);

  constructor(
    private readonly nats: NatsService,
    private readonly ragService: RagService,
  ) {}

  async onModuleInit() {
    await this.nats.handleRequest<RagQueryRequest, unknown>(
      SUBJECTS.RAG_QUERY_REQUEST,
      async (data) => {
        this.logger.log(`RAG query for workspace ${data.workspaceId}: ${data.query}`);
        return this.ragService.queryRag(data.workspaceId, data.query);
      },
    );

    this.logger.log('RAG handler initialized');
  }
}
