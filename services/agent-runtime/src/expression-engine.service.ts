import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _ = require('lodash') as {
  get: (obj: unknown, path: string) => unknown;
  filter: (arr: unknown[], predicate: (item: unknown) => boolean) => unknown[];
  first: <T>(arr: T[]) => T | undefined;
  last: <T>(arr: T[]) => T | undefined;
  flatten: <T>(arr: T[][]) => T[];
  uniq: <T>(arr: T[]) => T[];
  sortBy: <T>(arr: T[], field?: string) => T[];
};
import type { StepContext } from './adapters/adapter.interface';

/**
 * Expression engine for resolving dynamic references in workflow step parameters.
 *
 * Supports template expressions in step params that reference previous step results:
 *
 *   {{step[0].result}}                         → full result of step 0
 *   {{step[0].result.id}}                      → dot-path access
 *   {{step[0].result[0].name}}                 → array index + dot-path
 *   {{step[0].result | filter(type=invoice)}}  → filter array items
 *   {{step[0].result | map(id)}}               → extract field from each item
 *   {{step[0].result | first}}                 → first array item
 *   {{step[0].result | last}}                  → last array item
 *   {{step[0].result | count}}                 → count items
 *   {{step[0].result | join(,)}}               → join array items
 *   {{step[0].result | flatten}}               → flatten nested arrays
 *   "Hello {{step[0].result.name}}"            → string interpolation
 *
 * Inside for_each loops:
 *   {{item}}                                     → current iteration item
 *   {{item.fieldName}}                           → field of current item
 *   {{loop.index}}                               → current iteration index (0-based)
 *   {{parent[N].result}}                         → outer step N's result (from parent scope)
 *   {{parent[N].result.field}}                   → field of outer step N's result
 *
 * Pipes can be chained: {{step[0].result | filter(type=email) | map(id) | first}}
 */
@Injectable()
export class ExpressionEngine {
  private readonly logger = new Logger(ExpressionEngine.name);

  /** Regex matching a complete {{...}} expression */
  private static readonly EXPR_PATTERN = /\{\{((?:step\[\d+\]\.result|parent\[\d+\]\.result|item|loop\.index)(?:[.\[][^\s|}]+)?(?:\s*\|\s*\w+(?:\([^)]*\))?)*)\}\}/g;

  /** Regex for parsing step reference: step[N].result[.path] or step[N].result[M].path */
  private static readonly STEP_REF = /^step\[(\d+)\]\.result(?:([.\[].+))?$/;

  /** Regex for a single pipe: | pipeName(args) or | pipeName */
  private static readonly PIPE_PATTERN = /\|\s*(\w+)(?:\(([^)]*)\))?/g;

  /**
   * Resolve all template expressions in a params object.
   * Recursively walks values; for strings containing {{...}}, resolves them.
   */
  resolve(params: Record<string, unknown>, context: StepContext): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      resolved[key] = this.resolveValue(value, context);
    }

    return resolved;
  }

  private resolveValue(value: unknown, context: StepContext): unknown {
    if (typeof value !== 'string') {
      if (Array.isArray(value)) {
        return value.map((item) => this.resolveValue(item, context));
      }
      if (value && typeof value === 'object') {
        const resolved: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
          resolved[k] = this.resolveValue(v, context);
        }
        return resolved;
      }
      return value;
    }

    // Check if the entire string is a single expression (return native type)
    const trimmed = value.trim();
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}') && this.countExpressions(trimmed) === 1) {
      const inner = trimmed.slice(2, -2).trim();
      return this.evaluateExpression(inner, context);
    }

    // String interpolation: replace {{...}} within a larger string
    if (trimmed.includes('{{')) {
      return trimmed.replace(ExpressionEngine.EXPR_PATTERN, (_, expr) => {
        const result = this.evaluateExpression(expr.trim(), context);
        if (result === undefined || result === null) return '';
        if (typeof result === 'object') return JSON.stringify(result);
        return String(result);
      });
    }

    return value;
  }

  private countExpressions(str: string): number {
    const matches = str.match(/\{\{/g);
    return matches ? matches.length : 0;
  }

  private evaluateExpression(expr: string, context: StepContext): unknown {
    // Split expression into reference and pipe chain
    const pipeIndex = expr.indexOf('|');
    const refPart = pipeIndex >= 0 ? expr.substring(0, pipeIndex).trim() : expr.trim();
    const pipesPart = pipeIndex >= 0 ? expr.substring(pipeIndex) : '';

    let value: unknown;

    if (refPart === 'item' || refPart.startsWith('item.') || refPart.startsWith('item[')) {
      // Iteration item reference: {{item}}, {{item.name}}, {{item[0]}}
      value = context.iterationItem;
      if (refPart !== 'item') {
        const path = refPart.slice(4); // strip "item"
        const cleanPath = path.startsWith('.') ? path.slice(1) : path;
        if (cleanPath) value = _.get(value, cleanPath);
      }
    } else if (refPart === 'loop.index') {
      // Iteration index: {{loop.index}}
      value = context.iterationIndex ?? 0;
    } else if (refPart.startsWith('parent[')) {
      // Parent scope step reference: {{parent[N].result[.path]}}
      const parentMatch = refPart.match(/^parent\[(\d+)\]\.result(?:([.\[].+))?$/);
      if (!parentMatch) {
        this.logger.warn(`Invalid parent expression: "${expr}"`);
        return undefined;
      }
      const parentIdx = parseInt(parentMatch[1], 10);
      const rawPath = parentMatch[2];
      const path = rawPath?.startsWith('.') ? rawPath.slice(1) : rawPath;
      const parentResults = context.parentResults || [];
      if (parentIdx >= parentResults.length) {
        this.logger.warn(`Expression references parent[${parentIdx}] but only ${parentResults.length} parent results available`);
        return undefined;
      }
      value = parentResults[parentIdx];
      if (path) value = _.get(value, path);
    } else {
      // Step reference: step[N].result[.path]
      const stepMatch = refPart.match(ExpressionEngine.STEP_REF);
      if (!stepMatch) {
        this.logger.warn(`Invalid expression: "${expr}" — expected step[N].result[.path], item, or loop.index`);
        return undefined;
      }

      const stepIdx = parseInt(stepMatch[1], 10);
      const rawPath = stepMatch[2];
      const path = rawPath?.startsWith('.') ? rawPath.slice(1) : rawPath;

      if (stepIdx >= context.previousResults.length) {
        this.logger.warn(`Expression references step[${stepIdx}] but only ${context.previousResults.length} results available`);
        return undefined;
      }

      value = context.previousResults[stepIdx];
      if (path) {
        value = _.get(value, path);
      }
    }

    // Apply pipe chain
    if (pipesPart) {
      const pipes = this.parsePipes(pipesPart);
      for (const pipe of pipes) {
        value = this.applyPipe(value, pipe.name, pipe.args);
      }
    }

    return value;
  }

  private parsePipes(pipeStr: string): Array<{ name: string; args: string }> {
    const pipes: Array<{ name: string; args: string }> = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(ExpressionEngine.PIPE_PATTERN.source, 'g');

    while ((match = regex.exec(pipeStr)) !== null) {
      pipes.push({ name: match[1], args: match[2] || '' });
    }

    return pipes;
  }

  private applyPipe(value: unknown, pipeName: string, pipeArgs: string): unknown {
    switch (pipeName) {
      case 'filter': {
        if (!Array.isArray(value)) return value;
        // Parse args: "key=value" or "key=value,key2=value2"
        const predicates = this.parseFilterArgs(pipeArgs);
        return _.filter(value, (item: unknown) => {
          return predicates.every(([key, val]) => {
            const itemVal = _.get(item, key);
            return String(itemVal) === val;
          });
        });
      }

      case 'map': {
        if (!Array.isArray(value)) return value;
        const field = pipeArgs.trim();
        return value.map((item) => _.get(item, field));
      }

      case 'first':
        return Array.isArray(value) ? _.first(value) : value;

      case 'last':
        return Array.isArray(value) ? _.last(value) : value;

      case 'count':
        return Array.isArray(value) ? value.length : 0;

      case 'join': {
        if (!Array.isArray(value)) return value;
        const separator = pipeArgs.trim() || ', ';
        return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(separator);
      }

      case 'flatten':
        return Array.isArray(value) ? _.flatten(value) : value;

      case 'unique':
        return Array.isArray(value) ? _.uniq(value) : value;

      case 'sort': {
        if (!Array.isArray(value)) return value;
        const field = pipeArgs.trim();
        return field ? _.sortBy(value, field) : _.sortBy(value);
      }

      case 'reverse':
        return Array.isArray(value) ? [...value].reverse() : value;

      case 'slice': {
        if (!Array.isArray(value)) return value;
        const [start, end] = pipeArgs.split(',').map((s) => parseInt(s.trim(), 10));
        return value.slice(start || 0, end || undefined);
      }

      default:
        this.logger.warn(`Unknown pipe operation: "${pipeName}"`);
        return value;
    }
  }

  private parseFilterArgs(args: string): Array<[string, string]> {
    return args.split(',').map((part) => {
      const [key, ...valueParts] = part.trim().split('=');
      return [key.trim(), valueParts.join('=').trim()] as [string, string];
    });
  }
}
