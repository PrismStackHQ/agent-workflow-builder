import { Injectable } from '@nestjs/common';
import { ActionType, HttpMethod, ProxyActionConfig } from './proxy-action.types';

/**
 * Declarative config shapes stored as JSON in ProxyActionDefinition rows.
 */

export interface ParamMapping {
  from: string;
  to: string;
  aliases?: string[];
  default?: unknown;
  wrapArray?: boolean;
}

export interface QueryBuilderPart {
  template?: string; // e.g. "name contains '{{query}}'"
  when?: string;     // input field that must be present
  literal?: string;  // always included
}

export interface FieldsParam {
  paramName: string;      // query param name (e.g. "fields")
  wrapper?: string;       // optional wrapper (e.g. "files" → "files(f1,f2,...)")
}

export interface ParamsConfig {
  mappings?: ParamMapping[];
  defaults?: Record<string, string>;
  queryBuilder?: {
    target: string;       // output param name (e.g. "q")
    parts: QueryBuilderPart[];
    join: string;         // e.g. " and "
  };
  fieldsParam?: FieldsParam; // auto-derive API fields param from outputSchema
}

export interface HeadersConfig {
  static?: Record<string, string>;
}

export interface ExtractHeaders {
  path: string;           // e.g. "payload.headers"
  keyField: string;       // e.g. "name"
  valueField: string;     // e.g. "value"
  pick: Record<string, string>; // e.g. { "Subject": "subject", "From": "from" }
}

export interface PostProcessConfig {
  enrichment?: {
    sourceField?: string;
    endpoint: string;
    params?: Record<string, string>;
    merge: string[];
    extractHeaders?: ExtractHeaders;
    limit?: number;
  };
}

export interface ResponseConfig {
  rootPath?: string;
  pick?: string[];
  flatten?: boolean;
  extractHeaders?: ExtractHeaders;
  mergeFields?: Record<string, string>; // e.g. { "id": "id", "snippet": "snippet" }
  bodyExtract?: {
    partsPath: string;     // e.g. "payload.parts"
    fallbackPath: string;  // e.g. "payload.body.data"
    mimeType: string;      // e.g. "text/plain"
    outputField: string;   // e.g. "body"
  };
  attachmentExtract?: {
    partsPath: string;     // e.g. "payload.parts"
    filenameField: string; // e.g. "filename"
    outputField: string;   // e.g. "attachments"
    hasField?: string;     // e.g. "hasAttachments"
  };
}

export interface BodyConfig {
  mappings?: ParamMapping[];
  defaults?: Record<string, unknown>;
  template?: Record<string, unknown>;
  mimeEncode?: boolean; // Build RFC2822 MIME message (for email sending)
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
  inputSchema: unknown;
  outputSchema: unknown;
  isEnabled: boolean;
  isDefault: boolean;
}

/**
 * Converts ProxyActionDefinition DB rows (with declarative JSON configs)
 * into runtime ProxyActionConfig objects with real JavaScript functions.
 */
@Injectable()
export class DeclarativeConfigInterpreter {
  interpret(def: ProxyActionDefinitionRow): ProxyActionConfig {
    // Auto-enrich inputSchema with fields from queryBuilder/bodyTemplate
    // so the LLM planner knows about dynamically added parameters
    const enrichedInputSchema = this.enrichInputSchema(
      def.inputSchema as Record<string, unknown> | null,
      def.paramsConfig as ParamsConfig | null,
      def.bodyConfig as BodyConfig | null,
      def.endpoint,
    );

    const config: ProxyActionConfig = {
      providerConfigKey: def.providerConfigKey,
      actionName: def.actionName,
      actionType: def.actionType as ActionType,
      displayName: def.displayName,
      description: def.description || '',
      method: def.method as HttpMethod,
      endpoint: def.endpoint,
      inputSchema: enrichedInputSchema || undefined,
      outputSchema: (def.outputSchema as Record<string, unknown>) || undefined,
    };

    // Auto-generate mappings from inputSchema extended fields (mapTo, aliases, default, wrapArray)
    const inputSchema = enrichedInputSchema;
    const outputSchema = def.outputSchema as Record<string, unknown> | null;
    const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(def.method);

    let effectiveParamsConfig: ParamsConfig | null = def.paramsConfig
      ? { ...(def.paramsConfig as ParamsConfig) }
      : null;
    let effectiveBodyConfig: BodyConfig | null = def.bodyConfig
      ? { ...(def.bodyConfig as BodyConfig) }
      : null;

    if (inputSchema) {
      const autoMappings = this.extractInputMappings(
        inputSchema,
        def.endpoint,
        effectiveParamsConfig,
        effectiveBodyConfig,
      );

      if (autoMappings.length > 0) {
        if (isBodyMethod) {
          if (!effectiveBodyConfig) effectiveBodyConfig = {};
          effectiveBodyConfig.mappings = [...(effectiveBodyConfig.mappings || []), ...autoMappings];
        } else {
          if (!effectiveParamsConfig) effectiveParamsConfig = {};
          effectiveParamsConfig.mappings = [...(effectiveParamsConfig.mappings || []), ...autoMappings];
        }
      }
    }

    config.paramsBuilder = this.buildParamsBuilder(effectiveParamsConfig, outputSchema);
    config.bodyBuilder = this.buildBodyBuilder(effectiveBodyConfig);
    config.headersBuilder = this.buildHeadersBuilder(def.headersConfig as HeadersConfig | null);
    config.responseMapper = this.buildResponseMapper(def.responseConfig as ResponseConfig | null);
    config.postProcessor = this.buildPostProcessor(def.postProcessConfig as PostProcessConfig | null);

    return config;
  }

  private buildParamsBuilder(
    config: ParamsConfig | null,
    outputSchema?: Record<string, unknown> | null,
  ): ProxyActionConfig['paramsBuilder'] | undefined {
    if (!config) return undefined;

    return (input: Record<string, unknown>) => {
      const result: Record<string, string> = {};

      // Apply defaults first
      if (config.defaults) {
        Object.assign(result, config.defaults);
      }

      // Auto-derive fields param from outputSchema
      if (config.fieldsParam && outputSchema) {
        const fieldNames = this.extractSchemaFieldNames(outputSchema);
        if (fieldNames.length > 0) {
          const sorted = fieldNames.sort().join(',');
          result[config.fieldsParam.paramName] = config.fieldsParam.wrapper
            ? `${config.fieldsParam.wrapper}(${sorted})`
            : sorted;
        }
      }

      // Apply mappings
      if (config.mappings) {
        for (const mapping of config.mappings) {
          const allKeys = [mapping.from, ...(mapping.aliases || [])];
          let value: string | undefined;

          for (const key of allKeys) {
            if (input[key] !== undefined && input[key] !== null) {
              const raw = input[key];
              // Coerce floats to integers for numeric params (e.g. 10.0 → "10")
              value = typeof raw === 'number' ? String(Math.trunc(raw)) : String(raw);
              break;
            }
          }

          if (value !== undefined) {
            result[mapping.to] = value;
          } else if (mapping.default !== undefined) {
            result[mapping.to] = String(mapping.default);
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

  private extractSchemaFieldNames(schema: Record<string, unknown>): string[] {
    let props: Record<string, unknown> | undefined;
    if (schema.type === 'array') {
      props = ((schema.items as Record<string, unknown>) || {}).properties as Record<string, unknown>;
    } else {
      props = schema.properties as Record<string, unknown>;
    }
    return props ? Object.keys(props) : [];
  }

  /**
   * Auto-enrich inputSchema with fields referenced by queryBuilder parts
   * or bodyConfig templates that aren't already defined. This ensures the
   * LLM planner knows about dynamically added parameters (e.g., new
   * queryBuilder parts added via the UI).
   */
  private enrichInputSchema(
    inputSchema: Record<string, unknown> | null,
    paramsConfig: ParamsConfig | null,
    bodyConfig: BodyConfig | null,
    endpoint: string,
  ): Record<string, unknown> | null {
    // Collect all fields referenced in configs
    const referencedFields = new Set<string>();

    // From queryBuilder 'when' fields
    if (paramsConfig?.queryBuilder?.parts) {
      for (const part of paramsConfig.queryBuilder.parts) {
        if (part.when) referencedFields.add(part.when);
      }
    }

    // From bodyConfig template {{key}} placeholders
    if (bodyConfig?.template) {
      for (const value of Object.values(bodyConfig.template)) {
        if (typeof value === 'string') {
          for (const m of value.matchAll(/\{\{(\w+)\}\}/g)) {
            referencedFields.add(m[1]);
          }
        }
      }
    }

    if (referencedFields.size === 0) return inputSchema;

    // Path params shouldn't be added to inputSchema (already handled)
    const pathParams = new Set(
      [...endpoint.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
    );

    const schema = inputSchema
      ? JSON.parse(JSON.stringify(inputSchema))
      : { type: 'object', properties: {} };
    if (!schema.properties) schema.properties = {};

    for (const field of referencedFields) {
      if (pathParams.has(field)) continue;
      if (schema.properties[field]) continue; // already defined
      schema.properties[field] = {
        type: 'string',
        description: `Filter by ${field.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`,
      };
    }

    return schema;
  }

  /**
   * Auto-generate ParamMappings from inputSchema properties that have
   * extended fields (mapTo, aliases, default, wrapArray).
   * Excludes path params ({{key}} in endpoint) and queryBuilder inputs.
   */
  private extractInputMappings(
    inputSchema: Record<string, unknown>,
    endpoint: string,
    paramsConfig: ParamsConfig | null,
    bodyConfig: BodyConfig | null,
  ): ParamMapping[] {
    const props = inputSchema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!props) return [];

    // Collect fields that are already handled elsewhere
    const pathParams = new Set(
      [...endpoint.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
    );
    const queryBuilderFields = new Set<string>();
    if (paramsConfig?.queryBuilder?.parts) {
      for (const part of paramsConfig.queryBuilder.parts) {
        if (part.when) queryBuilderFields.add(part.when);
      }
    }
    const templateFields = new Set<string>();
    if (bodyConfig?.template) {
      for (const value of Object.values(bodyConfig.template)) {
        if (typeof value === 'string') {
          for (const m of value.matchAll(/\{\{(\w+)\}\}/g)) {
            templateFields.add(m[1]);
          }
        }
      }
    }
    const explicitFroms = new Set<string>();
    for (const m of paramsConfig?.mappings || []) explicitFroms.add(m.from);
    for (const m of bodyConfig?.mappings || []) explicitFroms.add(m.from);

    const mappings: ParamMapping[] = [];
    for (const [key, prop] of Object.entries(props)) {
      if (pathParams.has(key)) continue;
      if (queryBuilderFields.has(key)) continue;
      if (templateFields.has(key)) continue;
      if (explicitFroms.has(key)) continue;

      // Only auto-map if the property has mapping metadata OR is a simple passthrough
      const mapTo = prop.mapTo as string | undefined;
      const aliases = prop.aliases as string[] | undefined;
      const defaultVal = prop.default;
      const wrapArray = prop.wrapArray as boolean | undefined;

      // Skip properties with no mapping metadata that would just passthrough
      // (avoid sending LLM-only descriptive fields as API params)
      if (!mapTo && !aliases && defaultVal === undefined && !wrapArray) continue;

      mappings.push({
        from: key,
        to: mapTo || key,
        aliases,
        default: defaultVal,
        wrapArray,
      });
    }

    return mappings;
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
          let found = false;
          for (const key of allKeys) {
            if (input[key] !== undefined && input[key] !== null) {
              let val = input[key];
              if (mapping.wrapArray && !Array.isArray(val)) {
                val = [val];
              }
              result[mapping.to] = val;
              found = true;
              break;
            }
          }
          if (!found && mapping.default !== undefined) {
            result[mapping.to] = mapping.default;
          }
        }
      }

      // MIME encode for email sending (replaces gmail_rfc2822_sender transformer)
      if (config.mimeEncode) {
        return this.buildMimeMessage(input);
      }

      return result;
    };
  }

  private buildMimeMessage(input: Record<string, unknown>): Record<string, unknown> {
    // If raw is provided directly, use it as-is
    if (input.raw && !input.to) return { raw: input.raw };

    const to = String(input.to || '');
    const subject = String(input.subject || '(no subject)');
    const body = String(input.body || input.text || input.content || '');
    const cc = input.cc ? `Cc: ${input.cc}\r\n` : '';
    const attachmentPath = input.attachmentPath || input.attachment || input.filePath;

    if (attachmentPath) {
      const fs = require('fs');
      const path = require('path');
      const filePath = String(attachmentPath);

      if (fs.existsSync(filePath)) {
        const fileName = path.basename(filePath);
        const fileContent = fs.readFileSync(filePath);
        const fileBase64 = fileContent.toString('base64');
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.pdf': 'application/pdf',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.csv': 'text/csv', '.txt': 'text/plain', '.json': 'application/json',
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const parts = [
          `To: ${to}`, ...(input.cc ? [`Cc: ${input.cc}`] : []),
          `Subject: ${subject}`, 'MIME-Version: 1.0',
          `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
          `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', '', body, '',
          `--${boundary}`, `Content-Type: ${mimeType}; name="${fileName}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${fileName}"`, '', fileBase64, '',
          `--${boundary}--`,
        ];
        const raw = Buffer.from(parts.join('\r\n')).toString('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return { raw };
      }
    }

    // Plain text email (no attachment)
    const message = `To: ${to}\r\n${cc}Subject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`;
    const raw = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { raw };
  }

  private buildHeadersBuilder(
    config: HeadersConfig | null,
  ): ProxyActionConfig['headersBuilder'] | undefined {
    if (!config?.static) return undefined;

    const staticHeaders = config.static;
    return () => ({ ...staticHeaders });
  }

  /** Navigate nested path like "payload.headers" */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  /** Extract values from a key-value array (e.g., Gmail payload.headers) */
  private applyExtractHeaders(data: any, config: ExtractHeaders): Record<string, string> {
    const arr = this.getNestedValue(data, config.path);
    if (!Array.isArray(arr)) return {};
    const result: Record<string, string> = {};
    for (const [headerName, outputKey] of Object.entries(config.pick)) {
      const found = arr.find(
        (h: any) => h[config.keyField]?.toLowerCase() === headerName.toLowerCase(),
      );
      result[outputKey] = found?.[config.valueField] || '';
    }
    return result;
  }

  private buildResponseMapper(
    config: ResponseConfig | null,
  ): ProxyActionConfig['responseMapper'] | undefined {
    if (!config) return undefined;

    return (data: unknown) => {
      let result = data;

      // Complex single-object mapping (extractHeaders + mergeFields + bodyExtract + attachmentExtract)
      if (config.extractHeaders || config.mergeFields || config.bodyExtract || config.attachmentExtract) {
        const mapped: Record<string, unknown> = {};
        const raw = data as any;

        // Extract from key-value arrays (e.g., Gmail headers)
        if (config.extractHeaders) {
          Object.assign(mapped, this.applyExtractHeaders(raw, config.extractHeaders));
        }

        // Merge top-level fields
        if (config.mergeFields) {
          for (const [from, to] of Object.entries(config.mergeFields)) {
            mapped[to] = raw?.[from];
          }
        }

        // Extract body from nested parts
        if (config.bodyExtract) {
          const { partsPath, fallbackPath, mimeType, outputField } = config.bodyExtract;
          const parts = this.getNestedValue(raw, partsPath);
          let bodyData = '';
          if (Array.isArray(parts)) {
            const match = parts.find((p: any) => p.mimeType === mimeType);
            bodyData = match?.body?.data || '';
          }
          if (!bodyData) {
            bodyData = this.getNestedValue(raw, fallbackPath) || '';
          }
          mapped[outputField] = bodyData;
        }

        // Extract attachments from parts
        if (config.attachmentExtract) {
          const { partsPath, filenameField, outputField, hasField } = config.attachmentExtract;
          const parts = this.getNestedValue(raw, partsPath) || [];
          const attachments = Array.isArray(parts)
            ? parts
                .filter((p: any) => p[filenameField])
                .map((p: any) => ({
                  filename: p[filenameField],
                  mimeType: p.mimeType,
                  attachmentId: p.body?.attachmentId,
                  size: p.body?.size,
                }))
            : [];
          mapped[outputField] = attachments;
          if (hasField) mapped[hasField] = attachments.length > 0;
        }

        return mapped;
      }

      // Standard response mapping
      if (config.rootPath) {
        result = (data as any)?.[config.rootPath] ?? [];
      }
      if (config.flatten && Array.isArray(result)) {
        result = result.flat();
      }
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
            // Extract from key-value arrays (e.g., Gmail headers)
            if (enrichConfig.extractHeaders) {
              Object.assign(merged, this.applyExtractHeaders(detail, enrichConfig.extractHeaders));
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
