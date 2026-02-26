import { Injectable, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type { TokenResponse, ConnectionTokensRequest } from '@agent-workflow/shared-types';
import { PrismaService } from '@agent-workflow/prisma-client';

@Injectable()
export class TokenResolverService {
  private readonly logger = new Logger(TokenResolverService.name);

  constructor(
    private readonly nats: NatsService,
    private readonly prisma: PrismaService,
  ) {}

  async resolveTokens(orgId: string, providers: string[]): Promise<Map<string, TokenResponse>> {
    const tokens = new Map<string, TokenResponse>();

    // Find connection refs for each provider
    const refs = await this.prisma.connectionRef.findMany({
      where: { orgId, provider: { in: providers }, status: 'READY' },
    });

    for (const ref of refs) {
      try {
        const token = await this.nats.request<ConnectionTokensRequest, TokenResponse>(
          SUBJECTS.CONNECTION_TOKENS_REQUEST,
          { orgId, connectionRefId: ref.id },
          10000,
        );

        if ('error' in (token as any)) {
          this.logger.warn(`Token fetch error for ${ref.provider}: ${(token as any).error}`);
          // Use a mock token for development
          tokens.set(ref.provider, {
            accessToken: `mock-token-${ref.provider}`,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          });
        } else {
          tokens.set(ref.provider, token);
        }
      } catch (err) {
        this.logger.warn(`Failed to resolve token for ${ref.provider}, using mock: ${err}`);
        tokens.set(ref.provider, {
          accessToken: `mock-token-${ref.provider}`,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      }
    }

    return tokens;
  }
}
