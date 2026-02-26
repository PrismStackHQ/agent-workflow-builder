import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '@agent-workflow/prisma-client';
import { firstValueFrom } from 'rxjs';
import type { TokenResponse } from '@agent-workflow/shared-types';

@Injectable()
export class TokenFetcherService {
  private readonly logger = new Logger(TokenFetcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async fetchTokens(orgId: string, connectionRefId: string): Promise<TokenResponse> {
    const config = await this.prisma.customerConfig.findUnique({ where: { orgId } });
    if (!config?.connectionEndpointUrl) {
      throw new Error(`No connection endpoint configured for org ${orgId}`);
    }

    const connRef = await this.prisma.connectionRef.findUnique({ where: { id: connectionRefId } });
    if (!connRef) {
      throw new Error(`Connection ref ${connectionRefId} not found`);
    }

    this.logger.log(`Fetching tokens for org ${orgId}, ref ${connRef.externalRefId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${config.connectionEndpointUrl}/connections/get-tokens`,
          { externalRefId: connRef.externalRefId },
          {
            headers: {
              Authorization: `Bearer ${config.connectionEndpointApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data as TokenResponse;
    } catch (err) {
      this.logger.error(`Failed to fetch tokens: ${err}`);
      throw err;
    }
  }

  async requestOAuth(orgId: string, provider: string, redirectUrl: string) {
    const config = await this.prisma.customerConfig.findUnique({ where: { orgId } });
    if (!config?.connectionEndpointUrl) {
      throw new Error(`No connection endpoint configured for org ${orgId}`);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${config.connectionEndpointUrl}/connections/request-oauth`,
          { provider, customerId: orgId, redirectUrl },
          {
            headers: {
              Authorization: `Bearer ${config.connectionEndpointApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data as { externalRefId: string; authUrl: string };
    } catch (err) {
      this.logger.error(`Failed to request OAuth: ${err}`);
      throw err;
    }
  }
}
