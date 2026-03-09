import { ProxyActionConfig } from './proxy-action.types';

/**
 * Built-in transformer functions for proxy actions that require logic
 * too complex to express as declarative JSON config.
 *
 * Each transformer provides partial ProxyActionConfig overrides
 * (bodyBuilder, responseMapper, postProcessor, etc.) that are merged
 * into the declarative config at interpretation time.
 *
 * Transformers are referenced by name from the `transformerName` field
 * on ProxyActionDefinition rows in the database.
 */

/** Helper: extract a search query string from input, checking multiple param names */
function extractQuery(input: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (input[key] !== undefined && input[key] !== null && String(input[key]).trim()) {
      return String(input[key]).trim();
    }
  }
  return '';
}

/** Helper: extract numeric limit from input */
function extractLimit(input: Record<string, unknown>, defaultLimit = 10): number {
  return Number(input.maxResults || input.limit || input.max || input.per_page || input.pageSize || defaultLimit);
}

// -- Gmail Transformers -------------------------------------------------------

const gmailSearchParamsBuilder: ProxyActionConfig['paramsBuilder'] = (input) => {
  const searchText = extractQuery(input, 'query', 'q', 'search', 'keyword', 'keywords', 'subject');
  const params: Record<string, string> = {};
  if (searchText) params.q = searchText;
  if (input.from) params.q = `${params.q || ''} from:${input.from}`.trim();
  if (input.to) params.q = `${params.q || ''} to:${input.to}`.trim();
  const limit = extractLimit(input);
  params.maxResults = String(limit);
  if (input.labelIds) params.labelIds = String(input.labelIds);
  return params;
};

const gmailListParamsBuilder: ProxyActionConfig['paramsBuilder'] = (input) => {
  const limit = extractLimit(input);
  return { maxResults: String(limit) };
};

const gmailSearchEnricher: ProxyActionConfig['postProcessor'] = async (data, proxyFetch) => {
  const messages = data as Array<{ id: string; threadId: string }>;
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const enriched = await Promise.all(
    messages.slice(0, 10).map(async (msg) => {
      try {
        const detail: any = await proxyFetch(
          'GET',
          `/gmail/v1/users/me/messages/${msg.id}`,
          { format: 'metadata', metadataHeaders: 'Subject,From,Date' },
        );
        const headers = detail?.payload?.headers || [];
        const getH = (n: string) =>
          headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
        return {
          id: msg.id,
          threadId: msg.threadId,
          subject: getH('Subject'),
          from: getH('From'),
          date: getH('Date'),
          snippet: detail?.snippet || '',
        };
      } catch {
        return { id: msg.id, threadId: msg.threadId, subject: '', from: '', date: '', snippet: '' };
      }
    }),
  );
  return enriched;
};

const gmailFullEmailMapper: ProxyActionConfig['responseMapper'] = (data: any) => {
  const headers = data.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  return {
    id: data.id,
    threadId: data.threadId,
    subject: getHeader('Subject'),
    from: getHeader('From'),
    to: getHeader('To'),
    date: getHeader('Date'),
    snippet: data.snippet || '',
    labelIds: data.labelIds || [],
    body: data.payload?.body?.data || data.payload?.parts?.[0]?.body?.data || '',
    hasAttachments: (data.payload?.parts || []).some(
      (p: any) => p.filename && p.filename.length > 0,
    ),
    attachments: (data.payload?.parts || [])
      .filter((p: any) => p.filename && p.filename.length > 0)
      .map((p: any) => ({
        filename: p.filename,
        mimeType: p.mimeType,
        attachmentId: p.body?.attachmentId,
        size: p.body?.size,
      })),
  };
};

const gmailRfc2822Sender: ProxyActionConfig['bodyBuilder'] = (input) => {
  // If raw is provided directly, use it as-is
  if (input.raw && !input.to) {
    return { raw: input.raw };
  }
  // Build RFC 2822 message from simple params and base64url-encode it
  const to = String(input.to || '');
  const subject = String(input.subject || '(no subject)');
  const body = String(input.body || input.text || input.content || '');
  const cc = input.cc ? `Cc: ${input.cc}\r\n` : '';
  const message = `To: ${to}\r\n${cc}Subject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`;
  const raw = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { raw };
};

// -- Google Drive Transformers ------------------------------------------------

const driveSearchParamsBuilder: ProxyActionConfig['paramsBuilder'] = (input) => {
  const searchText = extractQuery(input, 'query', 'q', 'fileName', 'name', 'search', 'keyword', 'keywords');
  const parts: string[] = [];
  if (searchText) parts.push(`name contains '${searchText}'`);
  if (input.mimeType) parts.push(`mimeType='${input.mimeType}'`);
  parts.push('trashed=false');
  const limit = extractLimit(input);
  return {
    q: parts.join(' and '),
    pageSize: String(limit),
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
  };
};

const driveCreateFolderBodyBuilder: ProxyActionConfig['bodyBuilder'] = (input) => {
  const name = String(input.folderName || input.name || 'New Folder');
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (input.parentId) body.parents = [String(input.parentId)];
  return body;
};

const driveUploadFileBodyBuilder: ProxyActionConfig['bodyBuilder'] = (input) => {
  const name = String(input.fileName || input.name || 'Untitled');
  const body: Record<string, unknown> = { name };
  if (input.folderId) body.parents = [String(input.folderId)];
  if (input.mimeType) body.mimeType = String(input.mimeType);
  if (input.description || input.content) {
    const desc = String(input.description || input.content);
    // Google Drive API limits file.description length
    body.description = desc.length > 800 ? desc.substring(0, 797) + '...' : desc;
  }
  if (input.appProperties) body.appProperties = input.appProperties;
  return body;
};

// -- Slack Transformers -------------------------------------------------------

const slackPostMessageBodyBuilder: ProxyActionConfig['bodyBuilder'] = (input) => ({
  channel: input.channel,
  text: input.text,
  ...(input.blocks ? { blocks: input.blocks } : {}),
});

// -- Notion Transformers ------------------------------------------------------

const notionSearchBodyBuilder: ProxyActionConfig['bodyBuilder'] = (input) => {
  const searchText = extractQuery(input, 'query', 'q', 'search', 'keyword');
  const body: Record<string, unknown> = {};
  if (searchText) body.query = searchText;
  if (input.filter) body.filter = input.filter;
  if (input.sort) body.sort = input.sort;
  const limit = extractLimit(input);
  body.page_size = limit;
  return body;
};

// =============================================================================
// Transformer Registry
// =============================================================================

export type TransformerOverrides = Partial<
  Pick<ProxyActionConfig, 'paramsBuilder' | 'bodyBuilder' | 'headersBuilder' | 'responseMapper' | 'postProcessor'>
>;

/**
 * Map of transformer names to partial ProxyActionConfig overrides.
 * Referenced by ProxyActionDefinition.transformerName in the database.
 */
export const BUILT_IN_TRANSFORMERS: Record<string, TransformerOverrides> = {
  // Gmail
  gmail_search_params: { paramsBuilder: gmailSearchParamsBuilder },
  gmail_list_params: { paramsBuilder: gmailListParamsBuilder },
  gmail_search_enricher: { postProcessor: gmailSearchEnricher },
  gmail_list_enricher: { postProcessor: gmailSearchEnricher },
  gmail_full_email_mapper: { responseMapper: gmailFullEmailMapper },
  gmail_rfc2822_sender: { bodyBuilder: gmailRfc2822Sender },

  // Google Drive
  drive_search_params: { paramsBuilder: driveSearchParamsBuilder },
  drive_create_folder_body: { bodyBuilder: driveCreateFolderBodyBuilder },
  drive_upload_file_body: { bodyBuilder: driveUploadFileBodyBuilder },

  // Slack
  slack_post_message_body: { bodyBuilder: slackPostMessageBodyBuilder },

  // Notion
  notion_search_body: { bodyBuilder: notionSearchBodyBuilder },
};

/** Get a built-in transformer by name, or undefined if not found. */
export function getTransformer(name: string): TransformerOverrides | undefined {
  return BUILT_IN_TRANSFORMERS[name];
}

/** Get all registered transformer names (for validation). */
export function getTransformerNames(): string[] {
  return Object.keys(BUILT_IN_TRANSFORMERS);
}
