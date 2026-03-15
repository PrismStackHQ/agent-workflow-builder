import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { ProxyActionRegistry, TemplateLoaderService } from '@agent-workflow/integration-provider';
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
    private readonly templateLoader: TemplateLoaderService,
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

  /**
   * List all available templates with import status for this workspace.
   */
  async listTemplates(workspaceId: string) {
    const templates = this.templateLoader.listAvailableTemplates();

    // Get all existing proxy actions for this workspace to compute import status
    const existing = await this.prisma.proxyActionDefinition.findMany({
      where: { workspaceId },
      select: { providerConfigKey: true, actionName: true },
    });

    // Group existing actions by providerConfigKey (stripped to provider type)
    const existingByProvider = new Map<string, Set<string>>();
    for (const e of existing) {
      const key = e.providerConfigKey.replace(/-\d+$/, '');
      if (!existingByProvider.has(key)) existingByProvider.set(key, new Set());
      existingByProvider.get(key)!.add(e.actionName);
    }

    return templates.map((t) => {
      const importedActions = existingByProvider.get(t.providerType);
      return {
        ...t,
        isImported: !!importedActions && importedActions.size > 0,
        importedActionCount: importedActions?.size || 0,
      };
    });
  }

  /**
   * Get full template content for a provider type.
   */
  getTemplate(providerType: string) {
    const template = this.templateLoader.getTemplateFileRaw(providerType);
    if (!template) throw new NotFoundException(`No template found for provider type: ${providerType}`);
    return template;
  }

  /**
   * Import a template's actions into ProxyActionDefinition for a given providerConfigKey.
   * Idempotent — skips actions that already exist.
   */
  async importTemplate(workspaceId: string, providerType: string, providerConfigKey: string) {
    const templates = this.templateLoader.getTemplateForProvider(providerType);
    if (templates.length === 0) {
      throw new NotFoundException(`No template found for provider type: ${providerType}`);
    }

    // Check existing actions
    const existing = await this.prisma.proxyActionDefinition.findMany({
      where: { workspaceId, providerConfigKey },
      select: { actionName: true },
    });
    const existingActions = new Set(existing.map((e) => e.actionName));

    let created = 0;
    for (const template of templates) {
      if (existingActions.has(template.actionName)) continue;

      await this.prisma.proxyActionDefinition.create({
        data: {
          workspaceId,
          providerConfigKey,
          actionName: template.actionName,
          actionType: template.actionType,
          displayName: template.displayName,
          description: template.description,
          method: template.method,
          endpoint: template.endpoint,
          paramsConfig: (template.paramsConfig || undefined) as any,
          bodyConfig: (template.bodyConfig || undefined) as any,
          headersConfig: (template.headersConfig || undefined) as any,
          responseConfig: (template.responseConfig || undefined) as any,
          postProcessConfig: (template.postProcessConfig || undefined) as any,
          inputSchema: (template.inputSchema || undefined) as any,
          outputSchema: (template.outputSchema || undefined) as any,
          isDefault: true,
          isEnabled: true,
        },
      });
      created++;
    }

    this.proxyRegistry.invalidateCache(workspaceId);
    this.logger.log(`Imported ${created} proxy actions from template "${providerType}" for ${providerConfigKey}`);
    return { imported: created, skipped: templates.length - created, total: templates.length };
  }

  /**
   * Import from a user-provided template JSON.
   * Actions created with isDefault=false (user-provided).
   */
  async uploadTemplate(workspaceId: string, providerConfigKey: string, templateJson: unknown) {
    const validation = this.templateLoader.validateTemplate(templateJson);
    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    const template = templateJson as { actions: any[] };

    // Check existing actions
    const existing = await this.prisma.proxyActionDefinition.findMany({
      where: { workspaceId, providerConfigKey },
      select: { actionName: true },
    });
    const existingActions = new Set(existing.map((e) => e.actionName));

    let created = 0;
    for (const action of template.actions) {
      if (existingActions.has(action.actionName)) continue;

      await this.prisma.proxyActionDefinition.create({
        data: {
          workspaceId,
          providerConfigKey,
          actionName: action.actionName,
          actionType: action.actionType || 'GET',
          displayName: action.displayName || action.actionName,
          description: action.description || null,
          method: action.method,
          endpoint: action.endpoint,
          paramsConfig: (action.paramsConfig || undefined) as any,
          bodyConfig: (action.bodyConfig || undefined) as any,
          headersConfig: (action.headersConfig || undefined) as any,
          responseConfig: (action.responseConfig || undefined) as any,
          postProcessConfig: (action.postProcessConfig || undefined) as any,
          inputSchema: (action.inputSchema || undefined) as any,
          outputSchema: (action.outputSchema || undefined) as any,
          isDefault: false,
          isEnabled: true,
        },
      });
      created++;
    }

    this.proxyRegistry.invalidateCache(workspaceId);
    this.logger.log(`Uploaded ${created} proxy actions for ${providerConfigKey} from custom template`);
    return { imported: created, skipped: template.actions.length - created, total: template.actions.length };
  }

  /**
   * Get recommendations: templates that match available integrations but aren't yet imported.
   */
  async getRecommendations(workspaceId: string) {
    const availableIntegrations = await this.prisma.availableIntegration.findMany({
      where: { workspaceId },
      select: { providerConfigKey: true, displayName: true, rawMetadata: true },
    });

    const existing = await this.prisma.proxyActionDefinition.findMany({
      where: { workspaceId },
      select: { providerConfigKey: true, actionName: true },
    });

    // Group existing actions by providerConfigKey
    const existingByKey = new Map<string, number>();
    for (const e of existing) {
      existingByKey.set(e.providerConfigKey, (existingByKey.get(e.providerConfigKey) || 0) + 1);
    }

    const recommendations: Array<{
      providerType: string;
      providerConfigKey: string;
      displayName: string;
      actionCount: number;
      alreadyImported: boolean;
      importedActionCount: number;
    }> = [];

    for (const ai of availableIntegrations) {
      const meta = ai.rawMetadata as Record<string, unknown> | null;
      const providerType = (meta?.provider as string) || ai.providerConfigKey;
      const templates = this.templateLoader.getTemplateForProvider(providerType);
      if (templates.length === 0) continue;

      const importedCount = existingByKey.get(ai.providerConfigKey) || 0;
      recommendations.push({
        providerType,
        providerConfigKey: ai.providerConfigKey,
        displayName: ai.displayName,
        actionCount: templates.length,
        alreadyImported: importedCount >= templates.length,
        importedActionCount: importedCount,
      });
    }

    return recommendations;
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
  }
}
