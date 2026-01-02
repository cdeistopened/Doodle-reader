/**
 * Doodle Reader - Transcript Polishing Service
 *
 * Uses Gemini to clean up raw transcripts from AssemblyAI or YouTube.
 * Combines a base polishing prompt with show-specific context.
 */

// Base polishing instructions - adapted from Verbatim
const BASE_POLISH_PROMPT = `# Transcript Polishing Instructions

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
- It's okay to have longer passages without speaker changes if that reflects the content

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

## Quality Check

Before outputting: Would a reader who never heard the audio get the same information and sense of the speakers? If yes, your edit is fine.`;

/**
 * Build the full prompt combining base instructions, context, and transcript
 */
function buildPolishPrompt(
  transcript: string,
  contextPrompt?: string,
  episodeTitle?: string
): string {
  let fullPrompt = BASE_POLISH_PROMPT;

  // Add show-specific context if provided
  if (contextPrompt) {
    fullPrompt += '\n\n---\n\n# Show Context\n\n' + contextPrompt;
  }

  // Add episode info
  if (episodeTitle) {
    fullPrompt += `\n\n---\n\n# Episode: ${episodeTitle}`;
  }

  // Add the transcript to polish
  fullPrompt += '\n\n---\n\n## Transcript to Polish\n\n' + transcript;

  return fullPrompt;
}

/**
 * Get Gemini API key from environment or localStorage
 */
function getGeminiApiKey(): string | null {
  // Try environment variable first
  // @ts-ignore - Vite env
  if (import.meta.env?.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }

  // Try localStorage
  const stored = localStorage.getItem('gemini_api_key');
  if (stored) return stored;

  return null;
}

/**
 * Check if Gemini API key is available
 */
export function hasGeminiKey(): boolean {
  return !!getGeminiApiKey();
}

/**
 * Store Gemini API key in localStorage
 */
export function setGeminiKey(key: string): void {
  localStorage.setItem('gemini_api_key', key);
}

export interface PolishProgress {
  status: 'preparing' | 'polishing' | 'completed' | 'error';
  message: string;
}

type PolishProgressCallback = (progress: PolishProgress) => void;

/**
 * Polish a raw transcript using Gemini
 *
 * @param rawTranscript - The raw transcript text (from AssemblyAI or YouTube)
 * @param contextPrompt - Optional show-specific context (hosts, proper nouns, etc.)
 * @param episodeTitle - Optional episode title for additional context
 * @param onProgress - Optional progress callback
 * @returns The polished transcript markdown
 */
export async function polishTranscript(
  rawTranscript: string,
  contextPrompt?: string,
  episodeTitle?: string,
  onProgress?: PolishProgressCallback
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env or set it in settings.');
  }

  const report = (status: PolishProgress['status'], message: string) => {
    onProgress?.({ status, message });
  };

  report('preparing', 'Building polish prompt...');

  // Build the full prompt
  const fullPrompt = buildPolishPrompt(rawTranscript, contextPrompt, episodeTitle);

  report('polishing', 'Polishing transcript with Gemini...');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: fullPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 65536,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error?.message || `Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No content returned from Gemini');
    }

    report('completed', 'Transcript polished successfully!');
    return text;
  } catch (error: any) {
    report('error', error.message);
    throw error;
  }
}

/**
 * Generate a default context prompt template for a new feed
 */
export function generateContextTemplate(feedName: string): string {
  return `# ${feedName}

## Host(s)
- **Host Name** - Brief description

## Common Guests
- **Guest Name** - Their expertise/role

## Show Format
- Interview style, duration, typical topics

## Key Topics
- Main subjects covered on this show

## Mistranscriptions to Fix

| Wrong | Correct |
|-------|---------|
| example | Example |

## Speaker Identification Hints
- How to identify each speaker by their speech patterns
`;
}
