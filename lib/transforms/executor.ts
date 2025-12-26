/**
 * Transform Executor
 *
 * Runs transforms against content using Gemini.
 * Handles template interpolation, API calls, and result formatting.
 */

import type {
  Transform,
  TransformInput,
  TransformResult,
  TransformProgress,
  TransformProgressCallback,
} from './types';

// =============================================================================
// TEMPLATE ENGINE
// =============================================================================

/**
 * Simple Handlebars-like template interpolation.
 * Supports: {{variable}} and {{#if variable}}...{{/if}}
 */
function interpolateTemplate(template: string, variables: Record<string, string | undefined>): string {
  let result = template;

  // Handle conditionals: {{#if var}}content{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (_, varName, content) => {
    const value = variables[varName];
    return value && value.trim() ? content : '';
  });

  // Handle simple variable substitution: {{var}}
  const variableRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(variableRegex, (_, varName) => {
    return variables[varName] || '';
  });

  return result;
}

// =============================================================================
// API HELPERS
// =============================================================================

function getGeminiApiKey(): string | null {
  // @ts-ignore - Vite env
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('gemini_api_key');
  }
  return null;
}

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Execute a transform on input content.
 *
 * @param transform - The transform definition
 * @param input - The content and context to transform
 * @param onProgress - Optional progress callback
 * @returns The transform result
 */
export async function executeTransform(
  transform: Transform,
  input: TransformInput,
  onProgress?: TransformProgressCallback
): Promise<TransformResult> {
  const startTime = Date.now();
  const report = (status: TransformProgress['status'], message: string) => {
    onProgress?.({ status, message });
  };

  // Validate API key
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const error = 'Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env or set it in settings.';
    report('error', error);
    return {
      transformId: transform.id,
      output: '',
      executedAt: new Date().toISOString(),
      duration: Date.now() - startTime,
      error,
    };
  }

  report('preparing', `Preparing ${transform.name}...`);

  // Build the prompt from template
  const prompt = interpolateTemplate(transform.prompt, {
    content: input.content,
    title: input.title,
    sourceUrl: input.sourceUrl,
    author: input.author,
    contextPrompt: input.contextPrompt,
  });

  report('executing', `Running ${transform.name}...`);

  try {
    const model = transform.settings?.model || 'gemini-3-flash-preview';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: transform.settings?.temperature ?? 0.4,
            maxOutputTokens: transform.settings?.maxOutputTokens ?? 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error?.message || `Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    const output = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!output) {
      throw new Error('No content returned from Gemini');
    }

    // Extract usage if available
    const usage = data.usageMetadata
      ? {
          inputTokens: data.usageMetadata.promptTokenCount || 0,
          outputTokens: data.usageMetadata.candidatesTokenCount || 0,
        }
      : undefined;

    report('completed', `${transform.name} complete!`);

    return {
      transformId: transform.id,
      output,
      executedAt: new Date().toISOString(),
      duration: Date.now() - startTime,
      usage,
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Transform failed';
    report('error', errorMessage);

    return {
      transformId: transform.id,
      output: '',
      executedAt: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Validate that a transform can run on the given content.
 */
export function canRunTransform(
  transform: Transform,
  contentType: 'transcript' | 'article' | 'document'
): boolean {
  return (
    transform.inputTypes.includes(contentType) ||
    transform.inputTypes.includes('any')
  );
}

/**
 * Estimate cost of running a transform (rough token estimate).
 */
export function estimateCost(contentLength: number): { inputTokens: number; estimatedCost: string } {
  // Rough estimate: 4 characters per token
  const inputTokens = Math.ceil(contentLength / 4);
  // Gemini 1.5 Flash pricing: $0.075 per 1M input tokens
  const cost = (inputTokens / 1_000_000) * 0.075;

  return {
    inputTokens,
    estimatedCost: cost < 0.01 ? '< $0.01' : `~$${cost.toFixed(3)}`,
  };
}
