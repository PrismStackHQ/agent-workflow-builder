import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '@agent-workflow/prisma-client';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async queryRag(orgId: string, query: string): Promise<unknown> {
    const config = await this.prisma.customerConfig.findUnique({ where: { orgId } });
    if (!config?.ragEndpointUrl) {
      this.logger.warn(`No RAG endpoint configured for org ${orgId}`);
      return { results: [] };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${config.ragEndpointUrl}/query`,
          { query },
          {
            headers: {
              Authorization: `Bearer ${config.ragEndpointApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data;
    } catch (err) {
      this.logger.error(`RAG query failed: ${err}`);
      return { results: [], error: String(err) };
    }
  }
}
