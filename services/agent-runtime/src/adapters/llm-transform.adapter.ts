import { Injectable, Logger } from '@nestjs/common';
import { generateText, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { IStepAdapter, StepContext } from './adapter.interface';

@Injectable()
export class LlmTransformAdapter implements IStepAdapter {
  readonly action = 'llm_transform';
  private readonly logger = new Logger(LlmTransformAdapter.name);

  private getModel() {
    const provider = process.env.LLM_TRANSFORM_PROVIDER || process.env.PLANNER_LLM_PROVIDER || 'openai';
    const modelName = process.env.LLM_TRANSFORM_MODEL || process.env.PLANNER_LLM_MODEL;
    if (provider === 'anthropic') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { anthropic } = require('@ai-sdk/anthropic');
        return anthropic(modelName || 'claude-sonnet-4-20250514');
      } catch {
        return openai(modelName || 'gpt-4o-mini');
      }
    }
    // Use gpt-4o-mini by default — higher rate limits and sufficient for data transforms
    return openai(modelName || 'gpt-4o-mini');
  }

  /** Rough char-to-token ratio (~4 chars per token). Max ~20K tokens for prompt. */
  private static readonly MAX_PROMPT_CHARS = 80_000;

  private truncatePrompt(prompt: string): string {
    if (prompt.length <= LlmTransformAdapter.MAX_PROMPT_CHARS) return prompt;
    const truncated = prompt.substring(0, LlmTransformAdapter.MAX_PROMPT_CHARS);
    this.logger.warn(`Prompt truncated from ${prompt.length} to ${LlmTransformAdapter.MAX_PROMPT_CHARS} chars`);
    return truncated + '\n\n[...truncated due to length]';
  }

  async execute(params: Record<string, unknown>, _context: StepContext): Promise<unknown> {
    const rawPrompt = params.prompt as string;
    const prompt = this.truncatePrompt(rawPrompt);
    const outputSchema = params.outputSchema as Record<string, unknown> | undefined;
    const model = this.getModel();

    this.logger.log(`Executing llm_transform (structured: ${!!outputSchema}, prompt: ${prompt.length} chars)`);

    if (outputSchema) {
      // generateObject requires top-level type: "object" — wrap non-object schemas
      const schemaType = outputSchema.type as string;
      if (schemaType === 'object') {
        const zodSchema = this.jsonSchemaToZod(outputSchema);
        const result = await generateObject({ model, prompt, schema: zodSchema });
        return result.object;
      } else {
        // Wrap in an object envelope: { result: <original> }
        const innerZod = this.jsonSchemaToZod(outputSchema);
        const wrappedSchema = z.object({ result: innerZod });
        const result = await generateObject({ model, prompt, schema: wrappedSchema });
        return (result.object as Record<string, unknown>).result;
      }
    } else {
      const result = await generateText({ model, prompt, maxTokens: 4000 });
      try {
        return JSON.parse(result.text);
      } catch {
        return result.text;
      }
    }
  }

  private jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
    const type = schema.type as string;
    const description = schema.description as string | undefined;

    let zodType: z.ZodType;

    switch (type) {
      case 'string':
        zodType = z.string();
        break;
      case 'number':
      case 'integer':
        zodType = z.number();
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      case 'array': {
        const items = schema.items as Record<string, unknown>;
        zodType = z.array(items ? this.jsonSchemaToZod(items) : z.unknown());
        break;
      }
      case 'object': {
        const props = (schema.properties as Record<string, Record<string, unknown>>) || {};
        const shape: Record<string, z.ZodType> = {};
        for (const [key, propSchema] of Object.entries(props)) {
          shape[key] = this.jsonSchemaToZod(propSchema);
        }
        zodType = z.object(shape);
        break;
      }
      default:
        zodType = z.unknown();
    }

    if (description && 'describe' in zodType) {
      zodType = (zodType as z.ZodString).describe(description);
    }

    return zodType;
  }
}
