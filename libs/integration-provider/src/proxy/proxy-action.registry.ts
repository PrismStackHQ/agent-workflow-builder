import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { ActionType, ProxyActionConfig } from './proxy-action.types';
import { DeclarativeConfigInterpreter } from './declarative-config-interpreter';

/**
 * Workspace-scoped registry of proxy action configurations.
 *
 * Loads ProxyActionDefinition rows from the database and converts them
 * into runtime ProxyActionConfig objects using the DeclarativeConfigInterpreter.
 * Results are cached per workspace with a configurable TTL.
 *
 * ProxyActionDefinition.providerConfigKey stores the actual Nango integration key
 * (e.g., "google-mail", "google-drive-4") which matches ToolRegistryEntry.integrationKey
 * directly — no normalization needed.
 */
@Injectable()
export class ProxyActionRegistry {
  private readonly logger = new Logger(ProxyActionRegistry.name);

  /** Cache per workspace: key = workspaceId */
  private readonly cache = new Map<
    string,
    {
      configs: Map<string, ProxyActionConfig>;
      aliases: Map<string, string>;
      loadedAt: number;
    }
  >();

  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly interpreter: DeclarativeConfigInterpreter,
  ) {}

  private key(providerConfigKey: string, actionName: string): string {
    return `${providerConfigKey}::${actionName}`;
  }

  /**
   * Ensure configs are loaded for a workspace (loads from DB if cache expired).
   */
  async ensureLoaded(workspaceId: string): Promise<void> {
    const cached = this.cache.get(workspaceId);
    if (cached && Date.now() - cached.loadedAt < ProxyActionRegistry.CACHE_TTL_MS) {
      return;
    }
    await this.loadForWorkspace(workspaceId);
  }

  /**
   * Load all enabled proxy action definitions for a workspace from the database.
   */
  async loadForWorkspace(workspaceId: string): Promise<void> {
    const rows = await this.prisma.proxyActionDefinition.findMany({
      where: { workspaceId, isEnabled: true },
    });

    const configs = new Map<string, ProxyActionConfig>();
    const aliases = new Map<string, string>();

    for (const row of rows) {
      const config = this.interpreter.interpret(row);
      configs.set(this.key(config.providerConfigKey, config.actionName), config);
    }

    // Build action aliases from common patterns
    this.registerDefaultAliases(aliases);

    this.cache.set(workspaceId, {
      configs,
      aliases,
      loadedAt: Date.now(),
    });

    this.logger.log(
      `Loaded ${configs.size} proxy actions for workspace ${workspaceId} ` +
      `(providers: ${[...new Set([...configs.values()].map((c) => c.providerConfigKey))].join(', ')})`,
    );
  }

  /**
   * Invalidate cached configs for a workspace (e.g., after CRUD operations).
   */
  invalidateCache(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }

  /**
   * Find a proxy config by provider and action name.
   * Must call ensureLoaded() before using this method.
   *
   * providerConfigKey is the actual Nango integration key (e.g., "google-mail"),
   * matching ProxyActionDefinition.providerConfigKey directly.
   */
  find(
    workspaceId: string,
    providerConfigKey: string,
    actionName: string,
  ): ProxyActionConfig | undefined {
    const cached = this.cache.get(workspaceId);
    if (!cached) {
      this.logger.warn(`No cached proxy configs for workspace ${workspaceId}`);
      return undefined;
    }

    this.logger.log(`Proxy lookup: provider="${providerConfigKey}" action="${actionName}"`);

    // 1. Exact match (direct Nango key match)
    const exact = cached.configs.get(this.key(providerConfigKey, actionName));
    if (exact) {
      this.logger.log(`  → Exact match: ${this.key(providerConfigKey, actionName)}`);
      return exact;
    }

    // 2. Try action aliases (e.g., "send-email" → "send_email")
    const resolvedAction = cached.aliases.get(actionName);
    if (resolvedAction) {
      this.logger.log(`  Action alias: "${actionName}" → "${resolvedAction}"`);
      const aliasMatch = cached.configs.get(this.key(providerConfigKey, resolvedAction));
      if (aliasMatch) return aliasMatch;
    }

    // 3. Fallback: first SEARCH action for this provider
    const searchFallback = this.findByType(workspaceId, providerConfigKey, 'SEARCH');
    if (searchFallback.length > 0) {
      this.logger.warn(
        `No exact proxy match for "${providerConfigKey}::${actionName}", ` +
        `falling back to SEARCH action "${searchFallback[0].actionName}"`,
      );
      return searchFallback[0];
    }

    this.logger.warn(`No proxy config found for "${providerConfigKey}::${actionName}"`);
    return undefined;
  }

  /** Find all proxy actions of a given type for a specific provider. */
  findByType(workspaceId: string, providerConfigKey: string, actionType: ActionType): ProxyActionConfig[] {
    const cached = this.cache.get(workspaceId);
    if (!cached) return [];

    return Array.from(cached.configs.values()).filter(
      (c) => c.providerConfigKey === providerConfigKey && c.actionType === actionType,
    );
  }

  /** Get all cached proxy action configs for a workspace. */
  getAll(workspaceId: string): ProxyActionConfig[] {
    const cached = this.cache.get(workspaceId);
    if (!cached) return [];
    return Array.from(cached.configs.values());
  }

  /**
   * Register common action name aliases so the LLM planner can use
   * natural names and still resolve to correct proxy actions.
   */
  private registerDefaultAliases(aliases: Map<string, string>): void {
    // Google Drive
    aliases.set('documents', 'search_files');
    aliases.set('files', 'search_files');
    aliases.set('search_documents', 'search_files');
    aliases.set('find_files', 'search_files');
    aliases.set('find_documents', 'search_files');
    aliases.set('create_directory', 'create_folder');
    aliases.set('new_folder', 'create_folder');
    aliases.set('mkdir', 'create_folder');
    aliases.set('upload', 'upload_file');
    aliases.set('copy_file', 'upload_file');
    aliases.set('save_file', 'upload_file');

    // Gmail
    aliases.set('emails', 'search_emails');
    aliases.set('mail', 'search_emails');
    aliases.set('find_emails', 'search_emails');
    aliases.set('messages', 'list_emails');
    aliases.set('email_details', 'get_email');
    aliases.set('read_email', 'get_email');
    aliases.set('download_attachment', 'get_attachment');
    aliases.set('send-email', 'send_email');
    aliases.set('compose_email', 'send_email');

    // Slack
    aliases.set('send_message', 'post_message');
    aliases.set('channels', 'list_channels');

    // Notion
    aliases.set('pages', 'search');
    aliases.set('find_pages', 'search');
    aliases.set('search_pages', 'search');

    // GitHub
    aliases.set('repos', 'list_repos');
    aliases.set('repositories', 'list_repos');
    aliases.set('issues', 'search_issues');
    aliases.set('find_issues', 'search_issues');
  }
}
