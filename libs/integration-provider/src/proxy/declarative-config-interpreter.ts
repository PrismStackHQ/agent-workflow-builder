import { Injectable, Logger } from '@nestjs/common';
import { ActionType, HttpMethod, ProxyActionConfig } from './proxy-action.types';
import { getTransformer, TransformerOverrides } from './built-in-transformers';

/**
 * Declarative config shapes stored as JSON in ProxyActionDefinition rows.
 */

export interface ParamMapping {
  from: string;
  to: string;
  aliases?: string[];
  default?: string;
}

export interface QueryBuilderPart {
  template?: string; // e.g. "name contains '{{query}}'"
  when?: string;     // input field that must be present
  literal?: string;  // always included
}

export interface ParamsConfig {
  mappings?: ParamMapping[];
  defaults?: Record<string, string>;
  queryBuilder?: {
    target: string;       // output param name (e.g. "q")
    parts: QueryBuilderPart[];
    join: string;         // e.g. " and "
  };
}

export interface BodyConfig {
  mappings?: ParamMapping[];
  defaults?: Record<string, unknown>;
  template?: Record<string, unknown>;
}

export interface HeadersConfig {
  static?: Record<string, string>;
}

export interface ResponseConfig {
  rootPath?: string;
  pick?: string[];
  flatten?: boolean;
}

export interface PostProcessConfig {
  enrichment?: {
    sourceField?: string;
    endpoint: string;
    params?: Record<string, string>;
    merge: string[];
    limit?: number;
  };
}

/**
 * Shape of a ProxyActionDefinition row from the database.
 * Matches the Prisma model fields.
 */
export interface ProxyActionDefinitionRow {
  id: string;
  workspaceId: string;
  providerConfigKey: string;
  actionName: string;
  actionType: string;
  displayName: string;
  description: string | null;
  method: string;
  endpoint: string;
  paramsConfig: unknown;
  bodyConfig: unknown;
  headersConfig: unknown;
  responseConfig: unknown;
  postProcessConfig: unknown;
  transformerName: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  isEnabled: boolean;
  isDefault: boolean;
}

/**
 * Converts ProxyActionDefinition DB rows (with declarative JSON configs)
 * into runtime ProxyActionConfig objects with real JavaScript functions.
 *
 * For actions that reference a transformerName, the built-in transformer's
 * functions take precedence over the declarative config.
 */
@Injectable()
export class DeclarativeConfigInterpreter {
  private readonly logger = new Logger(DeclarativeConfigInterpreter.name);

  interpret(def: ProxyActionDefinitionRow): ProxyActionConfig {
    // Load built-in transformer overrides if specified.
    // Supports compound names like "gmail_search_params+gmail_search_enricher"
    // which merges multiple transformers (later ones override earlier ones per field).
    const transformerOverrides: TransformerOverrides = {};
    if (def.transformerName) {
      const names = def.transformerName.split('+').map((n) => n.trim());
      for (const name of names) {
        const t = getTransformer(name);
        if (t) {
          Object.assign(transformerOverrides, t);
        } else {
          this.logger.warn(
            `Unknown transformer "${name}" for ${def.providerConfigKey}::${def.actionName}`,
          );
        }
      }
    }

    const config: ProxyActionConfig = {
      providerConfigKey: def.providerConfigKey,
      actionName: def.actionName,
      actionType: def.actionType as ActionType,
      displayName: def.displayName,
      description: def.description || '',
      method: def.method as HttpMethod,
      endpoint: def.endpoint,
      inputSchema: (def.inputSchema as Record<string, unknown>) || undefined,
      outputSchema: (def.outputSchema as Record<string, unknown>) || undefined,
    };

    // Transformer overrides take precedence over declarative config
    config.paramsBuilder =
      transformerOverrides.paramsBuilder ||
      this.buildParamsBuilder(def.paramsConfig as ParamsConfig | null);

    config.bodyBuilder =
      transformerOverrides.bodyBuilder ||
      this.buildBodyBuilder(def.bodyConfig as BodyConfig | null);

    config.headersBuilder =
      transformerOverrides.headersBuilder ||
      this.buildHeadersBuilder(def.headersConfig as HeadersConfig | null);

    config.responseMapper =
      transformerOverrides.responseMapper ||
      this.buildResponseMapper(def.responseConfig as ResponseConfig | null);

    config.postProcessor =
      transformerOverrides.postProcessor ||
      this.buildPostProcessor(def.postProcessConfig as PostProcessConfig | null);

    return config;
  }

  private buildParamsBuilder(
    config: ParamsConfig | null,
  ): ProxyActionConfig['paramsBuilder'] | undefined {
    if (!config) return undefined;

    return (input: Record<string, unknown>) => {
      const result: Record<string, string> = {};

      // Apply defaults first
      if (config.defaults) {
        Object.assign(result, config.defaults);
      }

      // Apply mappings
      if (config.mappings) {
        for (const mapping of config.mappings) {
          const allKeys = [mapping.from, ...(mapping.aliases || [])];
          let value: string | undefined;

          for (const key of allKeys) {
            if (input[key] !== undefined && input[key] !== null) {
              value = String(input[key]);
              break;
            }
          }

          if (value !== undefined) {
            result[mapping.to] = value;
          } else if (mapping.default !== undefined) {
            result[mapping.to] = mapping.default;
          }
        }
      }

      // Apply queryBuilder (composite query string)
      if (config.queryBuilder) {
        const parts: string[] = [];
        for (const part of config.queryBuilder.parts) {
          if (part.literal) {
            parts.push(part.literal);
          } else if (part.template && part.when) {
            const value = input[part.when];
            if (value !== undefined && value !== null && String(value).trim()) {
              parts.push(
                part.template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(input[key] || '')),
              );
            }
          }
        }
        if (parts.length > 0) {
          result[config.queryBuilder.target] = parts.join(config.queryBuilder.join);
        }
      }

      return result;
    };
  }

  private buildBodyBuilder(
    config: BodyConfig | null,
  ): ProxyActionConfig['bodyBuilder'] | undefined {
    if (!config) return undefined;

    return (input: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};

      // Apply defaults
      if (config.defaults) {
        Object.assign(result, config.defaults);
      }

      // Apply template (replace {{key}} placeholders)
      if (config.template) {
        for (const [key, value] of Object.entries(config.template)) {
          if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
            const inputKey = value.slice(2, -2);
            if (input[inputKey] !== undefined) {
              result[key] = input[inputKey];
            }
          } else {
            result[key] = value;
          }
        }
      }

      // Apply mappings
      if (config.mappings) {
        for (const mapping of config.mappings) {
          const allKeys = [mapping.from, ...(mapping.aliases || [])];
          for (const key of allKeys) {
            if (input[key] !== undefined && input[key] !== null) {
              result[mapping.to] = input[key];
              break;
            }
          }
        }
      }

      return result;
    };
  }

  private buildHeadersBuilder(
    config: HeadersConfig | null,
  ): ProxyActionConfig['headersBuilder'] | undefined {
    if (!config?.static) return undefined;

    const staticHeaders = config.static;
    return () => ({ ...staticHeaders });
  }

  private buildResponseMapper(
    config: ResponseConfig | null,
  ): ProxyActionConfig['responseMapper'] | undefined {
    if (!config) return undefined;

    return (data: unknown) => {
      let result = data;

      // Extract from root path (e.g. "files", "messages", "results")
      if (config.rootPath) {
        result = (data as any)?.[config.rootPath] ?? [];
      }

      // Flatten nested arrays
      if (config.flatten && Array.isArray(result)) {
        result = result.flat();
      }

      // Pick specific fields from each item
      if (config.pick && Array.isArray(result)) {
        result = (result as any[]).map((item) => {
          const picked: Record<string, unknown> = {};
          for (const field of config.pick!) {
            picked[field] = item?.[field];
          }
          return picked;
        });
      }

      return result;
    };
  }

  private buildPostProcessor(
    config: PostProcessConfig | null,
  ): ProxyActionConfig['postProcessor'] | undefined {
    if (!config?.enrichment) return undefined;

    const enrichConfig = config.enrichment;

    return async (data: unknown, proxyFetch) => {
      const items = data as any[];
      if (!Array.isArray(items) || items.length === 0) return items;

      const limit = enrichConfig.limit || 10;
      const enriched = await Promise.all(
        items.slice(0, limit).map(async (item) => {
          try {
            // Replace {{field}} in endpoint with item values
            const endpoint = enrichConfig.endpoint.replace(
              /\{\{(\w+)\}\}/g,
              (_, key) => String(item[key] || ''),
            );
            const detail: any = await proxyFetch('GET', endpoint, enrichConfig.params);
            // Merge specified fields from detail into item
            const merged = { ...item };
            for (const field of enrichConfig.merge) {
              if (detail?.[field] !== undefined) {
                merged[field] = detail[field];
              }
            }
            return merged;
          } catch {
            return item;
          }
        }),
      );
      return enriched;
    };
  }
}
