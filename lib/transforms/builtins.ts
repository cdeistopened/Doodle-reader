/**
 * Built-in Transforms
 *
 * These are the default transforms that ship with Doodle Reader.
 * Users can't delete them, but they can create custom ones.
 */

import type { Transform } from './types';

// =============================================================================
// TRANSCRIPT TRANSFORMS (for podcasts and YouTube)
// =============================================================================

export const POLISH_TRANSCRIPT: Transform = {
  id: 'builtin:polish',
  name: 'Polish',
  description: 'Clean up raw transcript with accurate speaker labels, preserving original wording',
  prompt: `# Transcript Polishing Instructions

You are a transcript editor. Your PRIMARY job is to accurately identify speakers and make the transcript readable. Preserve the speaker's actual words as much as possible.

## Priority 1: Speaker Identification

This is your most important task. Before anything else, figure out who is speaking:

1. **Listen for introductions** - "I'm Sam Parr" / "Welcome back to My First Million"
2. **Listen for names being used** - "Sam, what do you think?" / "That's a great point, Shaan"
3. **Use role cues** - Who asks questions (host) vs who has expertise (guest)
4. **Check the episode title** - Guest names are often in the title

Replace generic labels (Speaker A, Speaker B, Speaker 1) with actual names. Format: **Name:** at the start of each speaker turn.

When you CANNOT identify a speaker by name:
- Use **Host:** and **Guest:** (not "Speaker A")
- For multiple guests, use **Guest 1:**, **Guest 2:** until you learn names
- Once you learn a name, go back mentally and use it consistently

## Priority 2: Preserve Original Wording

**Keep the speaker's actual words.** Only remove:
- Stammering/false starts ("I, I, I think" → "I think")
- Filler words that interrupt flow ("the, um, the company" → "the company")
- Self-corrections (keep the correction only)
- Incomplete abandoned sentences

**DO NOT:**
- Paraphrase or summarize what someone said
- Combine multiple statements into one
- Remove content because it seems redundant
- Change technical terms or names
- "Clean up" informal language or slang

## What to Remove Entirely

Only remove non-content segments:
- Podcast ads and sponsor reads
- "Can you hear me?" audio checks
- Station IDs after first mention

## Output Format

Use markdown with speaker labels:

\`\`\`markdown
## Topic/Section

**Sam:** The actual words they said, with only minimal cleanup.

**Shaan:** Their response, keeping their phrasing intact.
\`\`\`

Add ## headers only for major topic shifts.

## Output Rules

1. Output ONLY the polished transcript - no preamble
2. Do NOT start with "Here is..." or similar
3. Begin directly with the first section header
4. When in doubt, keep the original wording

{{#if contextPrompt}}
---
# Show Context (use this for speaker names!)
{{contextPrompt}}
{{/if}}

{{#if title}}
---
# Episode: {{title}}
{{/if}}

---
## Transcript to Polish

{{content}}`,
  inputTypes: ['transcript'],
  outputField: 'polished',
  settings: {
    temperature: 0.3,
    maxOutputTokens: 65536,
  },
  isBuiltIn: true,
  icon: 'PenTool',
  category: 'polish',
};

export const SUMMARIZE_TRANSCRIPT: Transform = {
  id: 'builtin:summarize-transcript',
  name: 'Summarize',
  description: 'Condensed bullet-point summary of key insights',
  prompt: `Summarize this transcript in 5-7 bullet points. Focus on the key insights and actionable takeaways.

Be concise but capture the essence of each major point discussed.

{{#if title}}
Title: {{title}}
{{/if}}

Transcript:
{{content}}`,
  inputTypes: ['transcript'],
  outputField: 'aiSummary',
  settings: {
    temperature: 0.4,
  },
  isBuiltIn: true,
  icon: 'Sparkles',
  category: 'summarize',
};

export const KEY_POINTS: Transform = {
  id: 'builtin:key-points',
  name: 'Key Points',
  description: 'Extract the 10 most important points as a numbered list',
  prompt: `Extract the 10 most important points from this transcript. Format as a numbered list with brief explanations for each point.

Focus on substantive insights, not meta-commentary or introductions.

{{#if title}}
Title: {{title}}
{{/if}}

Transcript:
{{content}}`,
  inputTypes: ['transcript'],
  outputField: 'keyPoints',
  settings: {
    temperature: 0.3,
  },
  isBuiltIn: true,
  icon: 'FileText',
  category: 'extract',
};

export const EXTRACT_QUOTES: Transform = {
  id: 'builtin:quotes',
  name: 'Quotes',
  description: 'Pull out the most quotable and insightful statements',
  prompt: `Extract the most quotable and insightful statements from this transcript.

For each quote:
1. Include the exact quote (or a cleaned-up version that preserves meaning)
2. Note who said it if identifiable
3. Add brief context about why it matters

Format as a list with the quote in quotation marks followed by attribution and context.

{{#if title}}
Title: {{title}}
{{/if}}

Transcript:
{{content}}`,
  inputTypes: ['transcript'],
  outputField: 'quotes',
  settings: {
    temperature: 0.4,
  },
  isBuiltIn: true,
  icon: 'Quote',
  category: 'extract',
};

// =============================================================================
// ARTICLE TRANSFORMS (for RSS feeds)
// =============================================================================

export const SUMMARIZE_ARTICLE: Transform = {
  id: 'builtin:summarize-article',
  name: 'Summarize',
  description: '3-bullet summary of the article',
  prompt: `Summarize this article into exactly 3 concise bullet points.

Style: Objective, journalistic, and dense. Each bullet should be a complete thought.

{{#if title}}
Article Title: {{title}}
{{/if}}

Article Content:
{{content}}`,
  inputTypes: ['article', 'document'],
  outputField: 'aiSummary',
  settings: {
    temperature: 0.3,
  },
  isBuiltIn: true,
  icon: 'Sparkles',
  category: 'summarize',
};

// =============================================================================
// REGISTRY
// =============================================================================

export const BUILTIN_TRANSFORMS: Transform[] = [
  POLISH_TRANSCRIPT,
  SUMMARIZE_TRANSCRIPT,
  KEY_POINTS,
  EXTRACT_QUOTES,
  SUMMARIZE_ARTICLE,
];

/**
 * Get built-in transforms for a specific content type
 */
export function getBuiltinsForType(inputType: 'transcript' | 'article' | 'document'): Transform[] {
  return BUILTIN_TRANSFORMS.filter(
    t => t.inputTypes.includes(inputType) || t.inputTypes.includes('any')
  );
}

/**
 * Get a built-in transform by ID
 */
export function getBuiltinById(id: string): Transform | undefined {
  return BUILTIN_TRANSFORMS.find(t => t.id === id);
}
