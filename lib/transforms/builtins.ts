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
  description: 'Clean up raw transcript into readable prose with speaker labels and sections',
  prompt: `# Transcript Polishing Instructions

You are a transcript editor. Your job is to make raw podcast/interview transcripts readable while preserving the meaning and technical accuracy of what was said.

## First: Understand the Content

Before editing, identify:
1. Who are the speakers? (Use introductions, how they address each other, expertise shown)
2. What is the subject matter? (Helps catch mistranscriptions of technical terms)
3. What is the format? (Interview, call-in show, lecture)

## Speaker Labels

Replace generic labels (Speaker A, Speaker B) with actual names when identifiable. Format: **Name:** at the start of each speaker turn.

**If no speaker labels exist** (common with YouTube auto-captions):
- Infer speaker changes from context (questions vs answers, "you" vs "I", topic expertise)
- Use names if speakers introduce themselves or address each other
- When uncertain, use descriptive labels like **Host:** and **Guest:** rather than guessing names

## What to Remove

Remove these (they add no substantive content):
- Station IDs and frequency announcements
- Call-in numbers after the first mention
- Underwriter/sponsor announcements
- Audio troubleshooting ("Can you hear me?")
- Scheduling logistics
- Podcast ads

## Editing Philosophy

Create a readable document, not a legal transcript. Prioritize clarity, but never change the meaning or lose technical information.

**Actively clean up:**
- Restart sentences (keep only the completed thought)
- Redundant phrases ("basically essentially" → delete one)
- Verbal tics mid-sentence ("the, you know, the mitochondria" → "the mitochondria")
- Self-corrections (keep the correction, remove the error)
- Stammering and false starts
- Trailing incomplete thoughts

**Always preserve:**
- Technical accuracy (100% - never paraphrase scientific claims)
- Speaker's characteristic vocabulary and phrasing style
- The logical flow of arguments
- Meaningful emotional emphasis

## Output Format

Use markdown with section headers when the topic changes:

\`\`\`markdown
## Section Title

**Speaker Name:** Their words, edited for readability.

**Other Speaker:** Their response.
\`\`\`

Add a new ## header when:
- A new question is asked
- The topic substantially shifts
- A caller joins

## Output Rules

1. Output ONLY the polished transcript markdown - no preamble, no meta-commentary
2. Do NOT start with phrases like "Here is the polished transcript..." or "Below is..."
3. Begin directly with the first section header (e.g., ## Introduction)

{{#if contextPrompt}}
---
# Show Context
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
