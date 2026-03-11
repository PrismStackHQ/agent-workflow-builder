import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { ProxyActionRegistry, getTransformerNames } from '@agent-workflow/integration-provider';
import { CreateProxyActionDto } from './dto/create-proxy-action.dto';
import { UpdateProxyActionDto } from './dto/update-proxy-action.dto';

const VALID_ACTION_TYPES = ['SEARCH', 'LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE', 'DOWNLOAD', 'SEND'];
const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

@Injectable()
export class ProxyActionsService {
  private readonly logger = new Logger(ProxyActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proxyRegistry: ProxyActionRegistry,
  ) {}

  async list(workspaceId: string) {
    return this.prisma.proxyActionDefinition.findMany({
      where: { workspaceId },
      orderBy: [{ providerConfigKey: 'asc' }, { actionName: 'asc' }],
    });
  }

  async getById(workspaceId: string, id: string) {
    const def = await this.prisma.proxyActionDefinition.findFirst({
      where: { id, workspaceId },
    });
    if (!def) throw new NotFoundException('Proxy action definition not found');
    return def;
  }

  async create(workspaceId: string, dto: CreateProxyActionDto) {
    this.validate(dto);

    const def = await this.prisma.proxyActionDefinition.create({
      data: {
        workspaceId,
        providerConfigKey: dto.providerConfigKey,
        actionName: dto.actionName,
        actionType: dto.actionType,
        displayName: dto.displayName,
        description: dto.description || null,
        method: dto.method,
        endpoint: dto.endpoint,
        paramsConfig: dto.paramsConfig as any,
        bodyConfig: dto.bodyConfig as any,
        headersConfig: dto.headersConfig as any,
        responseConfig: dto.responseConfig as any,
        postProcessConfig: dto.postProcessConfig as any,
        transformerName: dto.transformerName || null,
        inputSchema: dto.inputSchema as any,
        outputSchema: dto.outputSchema as any,
        isDefault: false,
      },
    });

    this.proxyRegistry.invalidateCache(workspaceId);
    this.logger.log(`Created proxy action: ${def.providerConfigKey}::${def.actionName} for workspace ${workspaceId}`);
    return def;
  }

  async update(workspaceId: string, id: string, dto: UpdateProxyActionDto) {
    const existing = await this.getById(workspaceId, id);

    if (dto.actionType && !VALID_ACTION_TYPES.includes(dto.actionType)) {
      throw new BadRequestException(`Invalid actionType: ${dto.actionType}`);
    }
    if (dto.method && !VALID_METHODS.includes(dto.method)) {
      throw new BadRequestException(`Invalid method: ${dto.method}`);
    }
    if (dto.transformerName !== undefined && dto.transformerName !== null) {
      const validNames = getTransformerNames();
      // Support chained transformers with "+" separator (e.g. "gmail_search_params+gmail_search_enricher")
      const parts = dto.transformerName.split('+').map((n) => n.trim());
      for (const part of parts) {
        if (!validNames.includes(part)) {
          throw new BadRequestException(
            `Unknown transformer: ${part}. Valid: ${validNames.join(', ')}`,
          );
        }
      }
    }

    const updated = await this.prisma.proxyActionDefinition.update({
      where: { id: existing.id },
      data: {
        ...(dto.providerConfigKey !== undefined && { providerConfigKey: dto.providerConfigKey }),
        ...(dto.actionName !== undefined && { actionName: dto.actionName }),
        ...(dto.actionType !== undefined && { actionType: dto.actionType }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.method !== undefined && { method: dto.method }),
        ...(dto.endpoint !== undefined && { endpoint: dto.endpoint }),
        ...(dto.paramsConfig !== undefined && { paramsConfig: dto.paramsConfig as any }),
        ...(dto.bodyConfig !== undefined && { bodyConfig: dto.bodyConfig as any }),
        ...(dto.headersConfig !== undefined && { headersConfig: dto.headersConfig as any }),
        ...(dto.responseConfig !== undefined && { responseConfig: dto.responseConfig as any }),
        ...(dto.postProcessConfig !== undefined && { postProcessConfig: dto.postProcessConfig as any }),
        ...(dto.transformerName !== undefined && { transformerName: dto.transformerName }),
        ...(dto.inputSchema !== undefined && { inputSchema: dto.inputSchema as any }),
        ...(dto.outputSchema !== undefined && { outputSchema: dto.outputSchema as any }),
      },
    });

    this.proxyRegistry.invalidateCache(workspaceId);
    this.logger.log(`Updated proxy action: ${updated.providerConfigKey}::${updated.actionName}`);
    return updated;
  }

  async remove(workspaceId: string, id: string) {
    const existing = await this.getById(workspaceId, id);
    if (existing.isDefault) {
      throw new BadRequestException(
        'Cannot delete default proxy actions. Use the toggle endpoint to disable instead.',
      );
    }

    await this.prisma.proxyActionDefinition.delete({ where: { id: existing.id } });
    this.proxyRegistry.invalidateCache(workspaceId);
    this.logger.log(`Deleted proxy action: ${existing.providerConfigKey}::${existing.actionName}`);
    return { ok: true };
  }

  async toggle(workspaceId: string, id: string) {
    const existing = await this.getById(workspaceId, id);

    const updated = await this.prisma.proxyActionDefinition.update({
      where: { id: existing.id },
      data: { isEnabled: !existing.isEnabled },
    });

    this.proxyRegistry.invalidateCache(workspaceId);
    this.logger.log(
      `Toggled proxy action ${existing.providerConfigKey}::${existing.actionName} → isEnabled=${updated.isEnabled}`,
    );
    return updated;
  }

  private validate(dto: CreateProxyActionDto): void {
    if (!dto.providerConfigKey) throw new BadRequestException('providerConfigKey is required');
    if (!dto.actionName) throw new BadRequestException('actionName is required');
    if (!dto.displayName) throw new BadRequestException('displayName is required');
    if (!dto.method) throw new BadRequestException('method is required');
    if (!dto.endpoint) throw new BadRequestException('endpoint is required');
    if (!dto.actionType) throw new BadRequestException('actionType is required');

    if (!VALID_ACTION_TYPES.includes(dto.actionType)) {
      throw new BadRequestException(
        `Invalid actionType: ${dto.actionType}. Valid: ${VALID_ACTION_TYPES.join(', ')}`,
      );
    }
    if (!VALID_METHODS.includes(dto.method)) {
      throw new BadRequestException(
        `Invalid method: ${dto.method}. Valid: ${VALID_METHODS.join(', ')}`,
      );
    }
    if (dto.transformerName) {
      const validNames = getTransformerNames();
      const parts = dto.transformerName.split('+').map((n) => n.trim());
      for (const part of parts) {
        if (!validNames.includes(part)) {
          throw new BadRequestException(
            `Unknown transformer: ${part}. Valid: ${validNames.join(', ')}`,
          );
        }
      }
    }
  }
}
