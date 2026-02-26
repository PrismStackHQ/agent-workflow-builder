import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const org = await this.prisma.organization.findFirst({
      where: { apiKey, deletedAt: null },
    });

    if (!org) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.org = org;
    return true;
  }
}
