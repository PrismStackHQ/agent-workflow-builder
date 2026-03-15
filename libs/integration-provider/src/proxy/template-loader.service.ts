import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

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
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface TemplateFile {
  schemaVersion: string;
  providerType: string;
  displayName: string;
  description: string;
  actions: ProxyActionTemplate[];
}

export interface TemplateSummary {
  providerType: string;
  displayName: string;
  description: string;
  actionCount: number;
}

@Injectable()
export class TemplateLoaderService {
  private readonly logger = new Logger(TemplateLoaderService.name);
  private readonly templateDir: string;

  constructor() {
    this.templateDir =
      process.env.TEMPLATE_DIR ||
      path.resolve(process.cwd(), 'templates', 'proxy-actions');
  }

  /**
   * List all available template files with metadata.
   */
  listAvailableTemplates(): TemplateSummary[] {
    const dir = this.templateDir;
    if (!fs.existsSync(dir)) {
      this.logger.warn(`Template directory not found: ${dir}`);
      return [];
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const summaries: TemplateSummary[] = [];

    for (const file of files) {
      try {
        const template = this.readTemplateFile(path.join(dir, file));
        if (template) {
          summaries.push({
            providerType: template.providerType,
            displayName: template.displayName,
            description: template.description,
            actionCount: template.actions.length,
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to read template file ${file}: ${err}`);
      }
    }

    return summaries;
  }

  /**
   * Get proxy action templates for a provider type.
   * Reads from JSON template files. Strips trailing -N suffix for matching
   * (e.g., "google-drive-4" → "google-drive").
   */
  getTemplateForProvider(providerType: string): ProxyActionTemplate[] {
    const template = this.loadTemplateFile(providerType);
    return template ? template.actions : [];
  }

  /**
   * Get the full raw template file content (for catalog API preview).
   */
  getTemplateFileRaw(providerType: string): TemplateFile | null {
    return this.loadTemplateFile(providerType);
  }

  /**
   * Validate a template JSON structure.
   */
  validateTemplate(data: unknown): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Template must be a JSON object' };
    }

    const t = data as Record<string, unknown>;
    if (!t.providerType || typeof t.providerType !== 'string') {
      return { valid: false, error: 'Missing or invalid providerType' };
    }
    if (!t.displayName || typeof t.displayName !== 'string') {
      return { valid: false, error: 'Missing or invalid displayName' };
    }
    if (!Array.isArray(t.actions) || t.actions.length === 0) {
      return { valid: false, error: 'actions must be a non-empty array' };
    }

    for (const action of t.actions) {
      if (!action.actionName || !action.method || !action.endpoint) {
        return { valid: false, error: `Action missing required fields (actionName, method, endpoint)` };
      }
    }

    return { valid: true };
  }

  private loadTemplateFile(providerType: string): TemplateFile | null {
    const dir = this.templateDir;
    if (!fs.existsSync(dir)) return null;

    // Try exact match first
    const exactPath = path.join(dir, `${providerType}.json`);
    if (fs.existsSync(exactPath)) {
      return this.readTemplateFile(exactPath);
    }

    // Strip trailing -N suffix and try again
    const stripped = providerType.replace(/-\d+$/, '');
    if (stripped !== providerType) {
      const strippedPath = path.join(dir, `${stripped}.json`);
      if (fs.existsSync(strippedPath)) {
        return this.readTemplateFile(strippedPath);
      }
    }

    return null;
  }

  private readTemplateFile(filePath: string): TemplateFile | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as TemplateFile;
    } catch (err) {
      this.logger.warn(`Failed to parse template file ${filePath}: ${err}`);
      return null;
    }
  }
}
