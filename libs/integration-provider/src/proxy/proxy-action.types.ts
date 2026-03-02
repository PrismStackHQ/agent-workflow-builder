/**
 * Semantic action categories that classify what an operation does.
 * Used to categorize proxy actions for discovery and workflow composition.
 *
 * Typical workflow chains:
 *   SEARCH → GET → DOWNLOAD → (local adapter: summarize)
 *   SEARCH → UPDATE → SEND
 *   LIST → GET → CREATE
 */
export type ActionType =
  | 'SEARCH'
  | 'LIST'
  | 'GET'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'DOWNLOAD'
  | 'SEND';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Configuration for a single proxy action. Maps a semantic action
 * (e.g., "search_files" on "google-drive") to the actual HTTP call
 * made through Nango's proxy API.
 *
 * The proxy API forwards requests to the third-party provider's REST API
 * using the OAuth credentials managed by Nango, so the endpoint and params
 * must match the target provider's API specification.
 *
 * @example
 * // Google Drive file search
 * {
 *   providerConfigKey: 'google-drive',
 *   actionName: 'search_files',
 *   actionType: 'SEARCH',
 *   displayName: 'Search Files',
 *   description: 'Search for files in Google Drive by name',
 *   method: 'GET',
 *   endpoint: '/drive/v3/files',
 *   paramsBuilder: (input) => ({
 *     q: `name='${input.fileName}' and trashed=false`,
 *     fields: 'files(id,name,mimeType)',
 *   }),
 *   responseMapper: (data) => data.files || [],
 * }
 */
export interface ProxyActionConfig {
  /** The Nango provider config key (e.g., "google-drive", "slack"). */
  providerConfigKey: string;

  /** The action name as used in AgentStep.action (e.g., "search_files"). */
  actionName: string;

  /** Semantic category for workflow composition and discovery. */
  actionType: ActionType;

  /** Human-readable display name. */
  displayName: string;

  /** Description of what this action does. */
  description: string;

  /** HTTP method for the proxy call. */
  method: HttpMethod;

  /**
   * Provider API endpoint path. Supports {{paramName}} placeholders
   * that are resolved from step params at runtime.
   * @example '/drive/v3/files/{{fileId}}'
   */
  endpoint: string;

  /**
   * Builds query parameters from step input.
   * Return an empty object or omit to send no query params.
   */
  paramsBuilder?: (input: Record<string, unknown>) => Record<string, string>;

  /**
   * Builds the request body from step input.
   * Only used for POST, PUT, and PATCH methods.
   */
  bodyBuilder?: (input: Record<string, unknown>) => Record<string, unknown>;

  /**
   * Builds additional headers to include in the proxy request.
   * Authorization, Connection-Id, and Provider-Config-Key are always set automatically.
   */
  headersBuilder?: (input: Record<string, unknown>) => Record<string, string>;

  /**
   * Transforms the raw provider API response before returning it
   * as the action result. If omitted, the raw response is returned as-is.
   */
  responseMapper?: (data: unknown) => unknown;

  /** JSON schema describing required input parameters. */
  inputSchema?: Record<string, unknown>;

  /** JSON schema describing the output shape. */
  outputSchema?: Record<string, unknown>;
}
