import { Injectable, Logger } from '@nestjs/common';
import { ActionType, ProxyActionConfig } from './proxy-action.types';

/**
 * Registry of proxy action configurations.
 *
 * Maps (providerConfigKey, actionName) pairs to their proxy HTTP call
 * configurations. The registry is pre-populated with default actions for
 * common providers and can be extended at runtime via `register()`.
 *
 * The ProviderExecutorService checks this registry before executing an action.
 * If a proxy config exists, the request is routed through Nango's proxy API
 * instead of the /action/trigger endpoint.
 *
 * @example
 * // Lookup a proxy config
 * const config = registry.find('google-drive', 'search_files');
 *
 * // Find all SEARCH actions across providers
 * const searchActions = registry.findAllByType('SEARCH');
 *
 * // Register a custom proxy action
 * registry.register({
 *   providerConfigKey: 'salesforce',
 *   actionName: 'search_contacts',
 *   actionType: 'SEARCH',
 *   displayName: 'Search Contacts',
 *   description: 'Search for contacts in Salesforce',
 *   method: 'GET',
 *   endpoint: '/services/data/v59.0/search',
 *   paramsBuilder: (input) => ({ q: `FIND {${input.query}} IN ALL FIELDS RETURNING Contact` }),
 * });
 */
@Injectable()
export class ProxyActionRegistry {
  private readonly logger = new Logger(ProxyActionRegistry.name);

  /** Key format: "providerConfigKey::actionName" */
  private readonly registry = new Map<string, ProxyActionConfig>();

  /**
   * Maps alternative action names to their canonical action name.
   * e.g., "documents" → "search_files", "emails" → "search_emails"
   */
  private readonly actionAliases = new Map<string, string>();

  constructor() {
    this.registerDefaults();
  }

  private key(providerConfigKey: string, actionName: string): string {
    return `${providerConfigKey}::${actionName}`;
  }

  /**
   * Normalizes a Nango provider config key by stripping the trailing
   * numeric suffix (e.g., "google-drive-4" → "google-drive").
   * Nango appends a number when multiple integrations of the same
   * provider are configured.
   */
  private normalizeProviderKey(providerConfigKey: string): string {
    return providerConfigKey.replace(/-\d+$/, '');
  }

  /** Register a proxy action configuration. */
  register(config: ProxyActionConfig): void {
    const k = this.key(config.providerConfigKey, config.actionName);
    this.registry.set(k, config);
    this.logger.log(`Registered proxy action: ${k} (${config.actionType})`);
  }

  /**
   * Register alternative action names that map to a canonical action.
   * This allows the LLM planner to use natural names like "documents"
   * or "files" and still resolve to the correct proxy action.
   */
  registerAlias(alias: string, canonicalActionName: string): void {
    this.actionAliases.set(alias, canonicalActionName);
  }

  /**
   * Find a proxy config by provider and action name.
   *
   * Matching strategy (in order):
   * 1. Exact match on providerConfigKey + actionName
   * 2. Normalized provider key (strip -N suffix) + exact actionName
   * 3. Exact provider key + resolved action alias
   * 4. Normalized provider key + resolved action alias
   * 5. Normalized provider key + first SEARCH action (fallback for unknown action names)
   */
  find(providerConfigKey: string, actionName: string): ProxyActionConfig | undefined {
    // 1. Exact match
    const exact = this.registry.get(this.key(providerConfigKey, actionName));
    if (exact) return exact;

    const normalizedKey = this.normalizeProviderKey(providerConfigKey);

    // 2. Normalized provider key + exact action name
    const normalizedProvider = this.registry.get(this.key(normalizedKey, actionName));
    if (normalizedProvider) return normalizedProvider;

    // 3-4. Try resolved alias with both exact and normalized key
    const resolvedAction = this.actionAliases.get(actionName);
    if (resolvedAction) {
      const aliasExact = this.registry.get(this.key(providerConfigKey, resolvedAction));
      if (aliasExact) return aliasExact;

      const aliasNormalized = this.registry.get(this.key(normalizedKey, resolvedAction));
      if (aliasNormalized) return aliasNormalized;
    }

    // 5. Fallback: find the default SEARCH action for this provider
    //    This handles cases where the LLM generates an unrecognized action name
    //    (e.g., "documents") that is clearly a search intent.
    const searchFallback = this.findByType(normalizedKey, 'SEARCH');
    if (searchFallback.length > 0) {
      this.logger.warn(
        `No exact proxy match for "${providerConfigKey}::${actionName}", ` +
        `falling back to SEARCH action "${searchFallback[0].actionName}"`,
      );
      return searchFallback[0];
    }

    return undefined;
  }

  /** Find all proxy actions of a given type for a specific provider. Handles normalized keys. */
  findByType(providerConfigKey: string, actionType: ActionType): ProxyActionConfig[] {
    const normalizedKey = this.normalizeProviderKey(providerConfigKey);
    return Array.from(this.registry.values()).filter(
      (c) => c.providerConfigKey === normalizedKey && c.actionType === actionType,
    );
  }

  /** Find all proxy actions of a given type across all providers. */
  findAllByType(actionType: ActionType): ProxyActionConfig[] {
    return Array.from(this.registry.values()).filter((c) => c.actionType === actionType);
  }

  /** Get all registered proxy action configs. */
  getAll(): ProxyActionConfig[] {
    return Array.from(this.registry.values());
  }

  // ---------------------------------------------------------------------------
  // Default proxy actions
  // ---------------------------------------------------------------------------

  private registerDefaults(): void {
    this.registerGoogleDriveActions();
    this.registerGmailActions();
    this.registerSlackActions();
    this.registerNotionActions();
    this.registerGitHubActions();
    this.registerDefaultAliases();
  }

  /**
   * Register common aliases for action names that the LLM planner might generate.
   * Maps natural language action names to canonical proxy action names.
   */
  private registerDefaultAliases(): void {
    // Google Drive aliases
    this.registerAlias('documents', 'search_files');
    this.registerAlias('files', 'search_files');
    this.registerAlias('search_documents', 'search_files');
    this.registerAlias('find_files', 'search_files');
    this.registerAlias('find_documents', 'search_files');

    // Gmail aliases
    this.registerAlias('emails', 'search_emails');
    this.registerAlias('mail', 'search_emails');
    this.registerAlias('find_emails', 'search_emails');
    this.registerAlias('messages', 'list_emails');

    // Slack aliases
    this.registerAlias('send_message', 'post_message');
    this.registerAlias('channels', 'list_channels');

    // Notion aliases
    this.registerAlias('pages', 'search');
    this.registerAlias('find_pages', 'search');
    this.registerAlias('search_pages', 'search');

    // GitHub aliases
    this.registerAlias('repos', 'list_repos');
    this.registerAlias('repositories', 'list_repos');
    this.registerAlias('issues', 'search_issues');
    this.registerAlias('find_issues', 'search_issues');
  }

  // -- Google Drive ------------------------------------------------------------

  /** Default result limit applied to proxy SEARCH/LIST actions */
  private static readonly DEFAULT_LIMIT = 10;

  /**
   * Extract a search query string from input, checking multiple possible
   * param names that the LLM planner might generate.
   */
  private static extractQuery(input: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      if (input[key] !== undefined && input[key] !== null && String(input[key]).trim()) {
        return String(input[key]).trim();
      }
    }
    return '';
  }

  private static extractLimit(input: Record<string, unknown>, defaultLimit = ProxyActionRegistry.DEFAULT_LIMIT): number {
    return Number(input.maxResults || input.limit || input.max || input.per_page || input.pageSize || defaultLimit);
  }

  private registerGoogleDriveActions(): void {
    this.register({
      providerConfigKey: 'google-drive',
      actionName: 'search_files',
      actionType: 'SEARCH',
      displayName: 'Search Files',
      description: 'Search for files in Google Drive by name or query',
      method: 'GET',
      endpoint: '/drive/v3/files',
      paramsBuilder: (input) => {
        const searchText = ProxyActionRegistry.extractQuery(input, 'query', 'q', 'fileName', 'name', 'search', 'keyword', 'keywords');
        const parts: string[] = [];
        if (searchText) parts.push(`name contains '${searchText}'`);
        if (input.mimeType) parts.push(`mimeType='${input.mimeType}'`);
        parts.push('trashed=false');
        const limit = ProxyActionRegistry.extractLimit(input);
        return {
          q: parts.join(' and '),
          pageSize: String(limit),
          fields: String(input.fields || 'files(id,name,mimeType,modifiedTime,webViewLink)'),
        };
      },
      responseMapper: (data: any) => data.files || [],
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query text (file name or keyword)' },
          fileName: { type: 'string', description: 'File name to search for (alias for query)' },
          mimeType: { type: 'string', description: 'MIME type filter' },
          maxResults: { type: 'number', description: 'Maximum results (default: 10)' },
          fields: { type: 'string', description: 'Fields to return' },
        },
      },
      outputSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            mimeType: { type: 'string' },
            modifiedTime: { type: 'string' },
          },
        },
      },
    });

    this.register({
      providerConfigKey: 'google-drive',
      actionName: 'get_file',
      actionType: 'GET',
      displayName: 'Get File Metadata',
      description: 'Get metadata for a specific Google Drive file',
      method: 'GET',
      endpoint: '/drive/v3/files/{{fileId}}',
      paramsBuilder: () => ({
        fields: 'id,name,mimeType,modifiedTime,size,webViewLink',
      }),
      inputSchema: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', description: 'The ID of the file' },
        },
      },
    });

    this.register({
      providerConfigKey: 'google-drive',
      actionName: 'download_file',
      actionType: 'DOWNLOAD',
      displayName: 'Download File',
      description: 'Download the content of a Google Drive file',
      method: 'GET',
      endpoint: '/drive/v3/files/{{fileId}}',
      paramsBuilder: () => ({ alt: 'media' }),
      inputSchema: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', description: 'The ID of the file to download' },
        },
      },
    });
  }

  // -- Gmail -------------------------------------------------------------------

  private registerGmailActions(): void {
    this.register({
      providerConfigKey: 'gmail',
      actionName: 'search_emails',
      actionType: 'SEARCH',
      displayName: 'Search Emails',
      description: 'Search for emails in Gmail using query syntax (subject, from, label, etc.)',
      method: 'GET',
      endpoint: '/gmail/v1/users/me/messages',
      paramsBuilder: (input) => {
        // Build Gmail search query from various possible input params
        const searchText = ProxyActionRegistry.extractQuery(input, 'query', 'q', 'search', 'keyword', 'keywords', 'subject');
        const params: Record<string, string> = {};
        if (searchText) params.q = searchText;
        if (input.from) params.q = `${params.q || ''} from:${input.from}`.trim();
        if (input.to) params.q = `${params.q || ''} to:${input.to}`.trim();
        const limit = ProxyActionRegistry.extractLimit(input);
        params.maxResults = String(limit);
        if (input.labelIds) params.labelIds = String(input.labelIds);
        return params;
      },
      responseMapper: (data: any) => data.messages || [],
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query (e.g., "from:user@example.com subject:invoice")' },
          keyword: { type: 'string', description: 'Search keyword (alias for query)' },
          from: { type: 'string', description: 'Filter by sender email address' },
          to: { type: 'string', description: 'Filter by recipient email address' },
          maxResults: { type: 'number', description: 'Maximum number of results (default: 10)' },
          labelIds: { type: 'string', description: 'Comma-separated label IDs to filter by' },
        },
      },
    });

    this.register({
      providerConfigKey: 'gmail',
      actionName: 'list_emails',
      actionType: 'LIST',
      displayName: 'List Emails',
      description: 'List recent emails from the inbox',
      method: 'GET',
      endpoint: '/gmail/v1/users/me/messages',
      paramsBuilder: (input) => {
        const limit = ProxyActionRegistry.extractLimit(input);
        const params: Record<string, string> = { maxResults: String(limit) };
        return params;
      },
      responseMapper: (data: any) => data.messages || [],
      inputSchema: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: 'Maximum number of results (default: 10)' },
        },
      },
    });

    this.register({
      providerConfigKey: 'gmail',
      actionName: 'get_email',
      actionType: 'GET',
      displayName: 'Get Email',
      description: 'Get the full content of a specific email',
      method: 'GET',
      endpoint: '/gmail/v1/users/me/messages/{{messageId}}',
      paramsBuilder: () => ({ format: 'full' }),
      inputSchema: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', description: 'The ID of the email message' },
        },
      },
    });

    this.register({
      providerConfigKey: 'gmail',
      actionName: 'send_email',
      actionType: 'SEND',
      displayName: 'Send Email',
      description: 'Send an email via Gmail',
      method: 'POST',
      endpoint: '/gmail/v1/users/me/messages/send',
      bodyBuilder: (input) => ({ raw: input.raw }),
      inputSchema: {
        type: 'object',
        required: ['raw'],
        properties: {
          raw: { type: 'string', description: 'Base64url-encoded email message (RFC 2822)' },
        },
      },
    });
  }

  // -- Slack -------------------------------------------------------------------

  private registerSlackActions(): void {
    this.register({
      providerConfigKey: 'slack',
      actionName: 'post_message',
      actionType: 'SEND',
      displayName: 'Post Message',
      description: 'Send a message to a Slack channel',
      method: 'POST',
      endpoint: '/chat.postMessage',
      bodyBuilder: (input) => ({
        channel: input.channel,
        text: input.text,
        ...(input.blocks ? { blocks: input.blocks } : {}),
      }),
      inputSchema: {
        type: 'object',
        required: ['channel', 'text'],
        properties: {
          channel: { type: 'string', description: 'Channel ID or name' },
          text: { type: 'string', description: 'Message text' },
          blocks: { type: 'array', description: 'Block Kit blocks for rich messages' },
        },
      },
    });

    this.register({
      providerConfigKey: 'slack',
      actionName: 'list_channels',
      actionType: 'LIST',
      displayName: 'List Channels',
      description: 'List Slack channels the bot has access to',
      method: 'GET',
      endpoint: '/conversations.list',
      paramsBuilder: (input) => {
        const limit = ProxyActionRegistry.extractLimit(input);
        return { types: 'public_channel,private_channel', limit: String(limit) };
      },
      responseMapper: (data: any) => data.channels || [],
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of channels to return' },
        },
      },
    });
  }

  // -- Notion ------------------------------------------------------------------

  private registerNotionActions(): void {
    this.register({
      providerConfigKey: 'notion',
      actionName: 'search',
      actionType: 'SEARCH',
      displayName: 'Search Notion',
      description: 'Search for pages and databases in Notion',
      method: 'POST',
      endpoint: '/v1/search',
      headersBuilder: () => ({ 'Notion-Version': '2022-06-28' }),
      bodyBuilder: (input) => {
        const searchText = ProxyActionRegistry.extractQuery(input, 'query', 'q', 'search', 'keyword');
        const body: Record<string, unknown> = {};
        if (searchText) body.query = searchText;
        if (input.filter) body.filter = input.filter;
        if (input.sort) body.sort = input.sort;
        const limit = ProxyActionRegistry.extractLimit(input);
        body.page_size = limit;
        return body;
      },
      responseMapper: (data: any) => data.results || [],
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query text' },
          filter: { type: 'object', description: 'Filter by object type (page or database)' },
          sort: { type: 'object', description: 'Sort order for results' },
        },
      },
    });

    this.register({
      providerConfigKey: 'notion',
      actionName: 'get_page',
      actionType: 'GET',
      displayName: 'Get Page',
      description: 'Retrieve a Notion page by ID',
      method: 'GET',
      endpoint: '/v1/pages/{{pageId}}',
      headersBuilder: () => ({ 'Notion-Version': '2022-06-28' }),
      inputSchema: {
        type: 'object',
        required: ['pageId'],
        properties: {
          pageId: { type: 'string', description: 'The Notion page ID' },
        },
      },
    });
  }

  // -- GitHub ------------------------------------------------------------------

  private registerGitHubActions(): void {
    this.register({
      providerConfigKey: 'github',
      actionName: 'list_repos',
      actionType: 'LIST',
      displayName: 'List Repositories',
      description: 'List repositories for the authenticated user',
      method: 'GET',
      endpoint: '/user/repos',
      paramsBuilder: (input) => {
        const limit = ProxyActionRegistry.extractLimit(input);
        const params: Record<string, string> = { per_page: String(limit) };
        if (input.sort) params.sort = String(input.sort);
        if (input.type) params.type = String(input.type);
        return params;
      },
      inputSchema: {
        type: 'object',
        properties: {
          sort: { type: 'string', description: 'Sort by: created, updated, pushed, full_name' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
          type: { type: 'string', description: 'Filter by type: all, owner, public, private, member' },
        },
      },
    });

    this.register({
      providerConfigKey: 'github',
      actionName: 'search_issues',
      actionType: 'SEARCH',
      displayName: 'Search Issues',
      description: 'Search for issues and pull requests across GitHub repositories',
      method: 'GET',
      endpoint: '/search/issues',
      paramsBuilder: (input) => {
        const searchText = ProxyActionRegistry.extractQuery(input, 'query', 'q', 'search', 'keyword');
        const limit = ProxyActionRegistry.extractLimit(input);
        const params: Record<string, string> = { per_page: String(limit) };
        if (searchText) params.q = searchText;
        if (input.sort) params.sort = String(input.sort);
        return params;
      },
      responseMapper: (data: any) => data.items || [],
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'GitHub search query (e.g., "repo:owner/name is:open label:bug")' },
          sort: { type: 'string', description: 'Sort by: comments, reactions, created, updated' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
        },
      },
    });
  }
}
