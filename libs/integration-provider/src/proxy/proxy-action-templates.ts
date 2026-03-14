/**
 * Default proxy action templates keyed by Nango provider type.
 *
 * When tools are synced, the system looks up AvailableIntegration.rawMetadata.provider
 * to find the provider type, then creates ProxyActionDefinition rows from these templates
 * with providerConfigKey set to the actual Nango integration key (e.g., "google-mail",
 * "google-drive-4").
 *
 * This means ProxyActionDefinition.providerConfigKey always matches
 * ToolRegistryEntry.integrationKey — no normalization needed.
 */

export interface ProxyActionTemplate {
  actionName: string;
  actionType: string;
  displayName: string;
  description: string;
  method: string;
  endpoint: string;
  paramsConfig?: Record<string, unknown>;
  bodyConfig?: Record<string, unknown>;
  headersConfig?: Record<string, unknown>;
  responseConfig?: Record<string, unknown>;
  postProcessConfig?: Record<string, unknown>;
  transformerName?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Map of Nango provider type → default proxy action templates.
 *
 * Provider types come from AvailableIntegration.rawMetadata.provider.
 * Multiple Nango integration keys can share the same provider type
 * (e.g., "google-drive-4" and "google-drive" both have provider "google-drive").
 */
export const PROXY_ACTION_TEMPLATES: Record<string, ProxyActionTemplate[]> = {
  // ==================== Google Drive ====================
  'google-drive': [
    {
      actionName: 'search_files',
      actionType: 'SEARCH',
      displayName: 'Search Files',
      description: 'Search for files in Google Drive by name or query',
      method: 'GET',
      endpoint: '/drive/v3/files',
      paramsConfig: {
        fieldsParam: { paramName: 'fields', wrapper: 'files' },
        mappings: [
          { from: 'maxResults', to: 'pageSize', default: '10', aliases: ['limit'] },
        ],
        queryBuilder: {
          target: 'q',
          join: ' and ',
          parts: [
            { template: "name contains '{{query}}'", when: 'query' },
            { template: "name contains '{{fileName}}'", when: 'fileName' },
            { template: "mimeType='{{mimeType}}'", when: 'mimeType' },
            { literal: 'trashed=false' },
          ],
        },
      },
      responseConfig: { rootPath: 'files' },
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query text (file name or keyword)' },
          fileName: { type: 'string', description: 'File name to search for (alias for query)' },
          mimeType: { type: 'string', description: 'MIME type filter' },
          maxResults: { type: 'number', description: 'Maximum results (default: 10)' },
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
    },
    {
      actionName: 'get_file',
      actionType: 'GET',
      displayName: 'Get File Metadata',
      description: 'Get metadata for a specific Google Drive file',
      method: 'GET',
      endpoint: '/drive/v3/files/{{fileId}}',
      paramsConfig: {
        fieldsParam: { paramName: 'fields' },
      },
      inputSchema: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', description: 'The ID of the file' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          mimeType: { type: 'string' },
          modifiedTime: { type: 'string' },
          size: { type: 'string' },
          webViewLink: { type: 'string' },
        },
      },
    },
    {
      actionName: 'download_file',
      actionType: 'DOWNLOAD',
      displayName: 'Download File',
      description: 'Download the content of a Google Drive file',
      method: 'GET',
      endpoint: '/drive/v3/files/{{fileId}}',
      paramsConfig: { defaults: { alt: 'media' } },
      inputSchema: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', description: 'The ID of the file to download' },
        },
      },
    },
    {
      actionName: 'create_folder',
      actionType: 'CREATE',
      displayName: 'Create Folder',
      description: 'Create a new folder in Google Drive',
      method: 'POST',
      endpoint: '/drive/v3/files',
      bodyConfig: {
        defaults: { mimeType: 'application/vnd.google-apps.folder' },
        mappings: [
          { from: 'folderName', to: 'name', aliases: ['name'] },
          { from: 'parentId', to: 'parents', wrapArray: true },
        ],
      },
      responseConfig: { pick: ['id', 'name', 'mimeType'] },
      inputSchema: {
        type: 'object',
        required: ['folderName'],
        properties: {
          folderName: { type: 'string', description: 'Name for the new folder' },
          parentId: { type: 'string', description: 'Parent folder ID (optional, defaults to root)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID of the created folder' },
          name: { type: 'string' },
          mimeType: { type: 'string' },
        },
      },
    },
    {
      actionName: 'upload_file',
      actionType: 'CREATE',
      displayName: 'Upload / Save File',
      description: 'Create a file entry in Google Drive with optional text content saved as description',
      method: 'POST',
      endpoint: '/drive/v3/files',
      bodyConfig: {
        mappings: [
          { from: 'fileName', to: 'name', aliases: ['name'] },
          { from: 'folderId', to: 'parents', wrapArray: true },
          { from: 'mimeType', to: 'mimeType' },
          { from: 'description', to: 'description', aliases: ['content'] },
        ],
      },
      responseConfig: { pick: ['id', 'name', 'mimeType', 'webViewLink'] },
      inputSchema: {
        type: 'object',
        required: ['fileName'],
        properties: {
          fileName: { type: 'string', description: 'Name for the file' },
          folderId: { type: 'string', description: 'Destination folder ID (from create_folder result)' },
          mimeType: { type: 'string', description: 'MIME type of the file' },
          content: { type: 'string', description: 'Text content to save as the file description' },
          description: { type: 'string', description: 'File description (alias for content)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID of the created file' },
          name: { type: 'string' },
          mimeType: { type: 'string' },
          webViewLink: { type: 'string' },
        },
      },
    },
  ],

  // ==================== Gmail ====================
  'google-mail': [
    {
      actionName: 'search_emails',
      actionType: 'SEARCH',
      displayName: 'Search Emails',
      description: 'Search for emails in Gmail using query syntax (subject, from, label, etc.)',
      method: 'GET',
      endpoint: '/gmail/v1/users/me/messages',
      transformerName: 'gmail_search_enricher',
      paramsConfig: {
        mappings: [
          { from: 'maxResults', to: 'maxResults', default: '10', aliases: ['limit'] },
          { from: 'labelIds', to: 'labelIds' },
        ],
        queryBuilder: {
          target: 'q',
          join: ' ',
          parts: [
            { template: '{{query}}', when: 'query' },
            { template: '{{keyword}}', when: 'keyword' },
            { template: 'from:{{from}}', when: 'from' },
            { template: 'to:{{to}}', when: 'to' },
          ],
        },
      },
      responseConfig: { rootPath: 'messages' },
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
      outputSchema: {
        type: 'array',
        description: 'Array of email summaries with subject, from, date, and snippet.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Message ID — pass to get_email to get full content' },
            threadId: { type: 'string' },
            subject: { type: 'string', description: 'Email subject line' },
            from: { type: 'string', description: 'Sender name and email' },
            date: { type: 'string', description: 'Date the email was sent' },
            snippet: { type: 'string', description: 'Short preview of the email body' },
          },
        },
      },
    },
    {
      actionName: 'list_emails',
      actionType: 'LIST',
      displayName: 'List Emails',
      description: 'List recent emails from the inbox',
      method: 'GET',
      endpoint: '/gmail/v1/users/me/messages',
      transformerName: 'gmail_list_enricher',
      paramsConfig: {
        mappings: [
          { from: 'maxResults', to: 'maxResults', default: '10', aliases: ['limit'] },
        ],
      },
      responseConfig: { rootPath: 'messages' },
      inputSchema: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: 'Maximum number of results (default: 10)' },
        },
      },
    },
    {
      actionName: 'get_email',
      actionType: 'GET',
      displayName: 'Get Email',
      description: 'Get the full content of a specific email including subject, body, sender, and attachment info',
      method: 'GET',
      endpoint: '/gmail/v1/users/me/messages/{{messageId}}',
      paramsConfig: { defaults: { format: 'full' } },
      transformerName: 'gmail_full_email_mapper',
      inputSchema: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', description: 'The ID of the email message' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          subject: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          date: { type: 'string' },
          snippet: { type: 'string', description: 'Short preview of the email body' },
          body: { type: 'string', description: 'Base64-encoded email body' },
          hasAttachments: { type: 'boolean' },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filename: { type: 'string' },
                mimeType: { type: 'string' },
                attachmentId: { type: 'string' },
                size: { type: 'number' },
              },
            },
          },
        },
      },
    },
    {
      actionName: 'get_attachment',
      actionType: 'DOWNLOAD',
      displayName: 'Get Attachment',
      description: 'Download an email attachment by message ID and attachment ID',
      method: 'GET',
      endpoint: '/gmail/v1/users/me/messages/{{messageId}}/attachments/{{attachmentId}}',
      inputSchema: {
        type: 'object',
        required: ['messageId', 'attachmentId'],
        properties: {
          messageId: { type: 'string', description: 'The email message ID' },
          attachmentId: { type: 'string', description: 'The attachment ID from get_email result' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Base64-encoded attachment content' },
          size: { type: 'number', description: 'Attachment size in bytes' },
        },
      },
    },
    {
      actionName: 'send_email',
      actionType: 'SEND',
      displayName: 'Send Email',
      description: 'Send an email via Gmail with optional file attachment. Pass attachmentPath from generate_pdf/generate_excel/generate_csv to attach a file.',
      method: 'POST',
      endpoint: '/gmail/v1/users/me/messages/send',
      transformerName: 'gmail_rfc2822_sender',
      inputSchema: {
        type: 'object',
        required: ['to', 'subject', 'body'],
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Plain text email body content' },
          cc: { type: 'string', description: 'CC recipient email address (optional)' },
          attachmentPath: { type: 'string', description: 'File path to attach (from generate_pdf, generate_excel, or generate_csv result)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID of the sent message' },
          threadId: { type: 'string' },
          labelIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  ],

  // ==================== Slack ====================
  slack: [
    {
      actionName: 'post_message',
      actionType: 'SEND',
      displayName: 'Post Message',
      description: 'Send a message to a Slack channel',
      method: 'POST',
      endpoint: '/chat.postMessage',
      bodyConfig: {
        template: { channel: '{{channel}}', text: '{{text}}' },
        mappings: [
          { from: 'blocks', to: 'blocks' },
        ],
      },
      inputSchema: {
        type: 'object',
        required: ['channel', 'text'],
        properties: {
          channel: { type: 'string', description: 'Channel ID or name' },
          text: { type: 'string', description: 'Message text' },
          blocks: { type: 'array', description: 'Block Kit blocks for rich messages' },
        },
      },
    },
    {
      actionName: 'list_channels',
      actionType: 'LIST',
      displayName: 'List Channels',
      description: 'List Slack channels the bot has access to',
      method: 'GET',
      endpoint: '/conversations.list',
      paramsConfig: {
        defaults: { types: 'public_channel,private_channel' },
        mappings: [
          { from: 'limit', to: 'limit', default: '10', aliases: ['maxResults'] },
        ],
      },
      responseConfig: { rootPath: 'channels' },
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of channels to return' },
        },
      },
    },
  ],

  // ==================== Notion ====================
  notion: [
    {
      actionName: 'search',
      actionType: 'SEARCH',
      displayName: 'Search Notion',
      description: 'Search for pages and databases in Notion',
      method: 'POST',
      endpoint: '/v1/search',
      headersConfig: { static: { 'Notion-Version': '2022-06-28' } },
      bodyConfig: {
        mappings: [
          { from: 'query', to: 'query', aliases: ['q', 'search', 'keyword'] },
          { from: 'filter', to: 'filter' },
          { from: 'sort', to: 'sort' },
          { from: 'limit', to: 'page_size', default: 10, aliases: ['maxResults'] },
        ],
      },
      responseConfig: { rootPath: 'results' },
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query text' },
          filter: { type: 'object', description: 'Filter by object type (page or database)' },
          sort: { type: 'object', description: 'Sort order for results' },
        },
      },
    },
    {
      actionName: 'get_page',
      actionType: 'GET',
      displayName: 'Get Page',
      description: 'Retrieve a Notion page by ID',
      method: 'GET',
      endpoint: '/v1/pages/{{pageId}}',
      headersConfig: { static: { 'Notion-Version': '2022-06-28' } },
      inputSchema: {
        type: 'object',
        required: ['pageId'],
        properties: {
          pageId: { type: 'string', description: 'The Notion page ID' },
        },
      },
    },
  ],

  // ==================== GitHub ====================
  github: [
    {
      actionName: 'list_repos',
      actionType: 'LIST',
      displayName: 'List Repositories',
      description: 'List repositories for the authenticated user',
      method: 'GET',
      endpoint: '/user/repos',
      paramsConfig: {
        mappings: [
          { from: 'per_page', to: 'per_page', default: '10', aliases: ['limit', 'maxResults'] },
          { from: 'sort', to: 'sort' },
          { from: 'type', to: 'type' },
        ],
      },
      inputSchema: {
        type: 'object',
        properties: {
          sort: { type: 'string', description: 'Sort by: created, updated, pushed, full_name' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
          type: { type: 'string', description: 'Filter by type: all, owner, public, private, member' },
        },
      },
    },
    {
      actionName: 'search_issues',
      actionType: 'SEARCH',
      displayName: 'Search Issues',
      description: 'Search for issues and pull requests across GitHub repositories',
      method: 'GET',
      endpoint: '/search/issues',
      paramsConfig: {
        mappings: [
          { from: 'query', to: 'q', aliases: ['q', 'search', 'keyword'] },
          { from: 'per_page', to: 'per_page', default: '10', aliases: ['limit', 'maxResults'] },
          { from: 'sort', to: 'sort' },
        ],
      },
      responseConfig: { rootPath: 'items' },
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'GitHub search query (e.g., "repo:owner/name is:open label:bug")' },
          sort: { type: 'string', description: 'Sort by: comments, reactions, created, updated' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
        },
      },
    },
  ],

  // ==================== Facebook ====================
  facebook: [
    {
      actionName: 'list_pages',
      actionType: 'LIST',
      displayName: 'List Pages',
      description: 'List Facebook Pages the authenticated user manages, including page access tokens and tasks',
      method: 'GET',
      endpoint: '/me/accounts',
      responseConfig: { rootPath: 'data' },
      inputSchema: {
        type: 'object',
        properties: {},
      },
      outputSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            access_token: { type: 'string', description: 'Page access token for making API calls on behalf of this page' },
            category: { type: 'string', description: 'Primary category of the page' },
            category_list: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
              description: 'List of categories assigned to the page',
            },
            name: { type: 'string', description: 'Name of the Facebook Page' },
            id: { type: 'string', description: 'Page ID' },
            tasks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Permissions/tasks the user has on this page (e.g., ADVERTISE, ANALYZE, CREATE_CONTENT, MESSAGING, MODERATE, MANAGE)',
            },
          },
        },
      },
    },
  ],

  // ==================== Google Calendar ====================
  'google-calendar': [
    {
      actionName: 'list_events',
      actionType: 'LIST',
      displayName: 'List Events',
      description: 'List upcoming events from Google Calendar',
      method: 'GET',
      endpoint: '/calendar/v3/calendars/primary/events',
      paramsConfig: {
        defaults: { maxResults: '10', orderBy: 'startTime', singleEvents: 'true' },
        mappings: [
          { from: 'maxResults', to: 'maxResults', aliases: ['limit'] },
        ],
      },
      responseConfig: { rootPath: 'items' },
      inputSchema: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: 'Max events to return (default: 10)' },
        },
      },
    },
    {
      actionName: 'get_event',
      actionType: 'GET',
      displayName: 'Get Event',
      description: 'Get details of a specific calendar event',
      method: 'GET',
      endpoint: '/calendar/v3/calendars/primary/events/{{eventId}}',
      inputSchema: {
        type: 'object',
        required: ['eventId'],
        properties: {
          eventId: { type: 'string', description: 'The calendar event ID' },
        },
      },
    },
  ],
};

/**
 * Find templates for a given provider type.
 * Tries exact match first, then strips trailing numbers (e.g., "google-drive-4" → "google-drive").
 */
export function getTemplatesForProvider(providerType: string): ProxyActionTemplate[] {
  if (PROXY_ACTION_TEMPLATES[providerType]) {
    return PROXY_ACTION_TEMPLATES[providerType];
  }
  // Strip trailing -N suffix
  const stripped = providerType.replace(/-\d+$/, '');
  return PROXY_ACTION_TEMPLATES[stripped] || [];
}
