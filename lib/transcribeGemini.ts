/**
 * Doodle Reader - Gemini Audio Transcription Service
 *
 * Uses Google Gemini 3 Flash Preview for audio transcription.
 * Features speaker diarization via prompt engineering.
 * 
 * Advantages over AssemblyAI:
 * - ~50x cheaper ($0.005/episode vs $0.27)
 * - Identifies speakers by name from context
 * - Handles intro music/ads separately
 */

// Gemini pricing estimate: ~$0.005 per hour of audio
const COST_PER_HOUR = 0.005;

// Use Files API for files over this size (in bytes)
const INLINE_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB

export interface GeminiTranscriptionResult {
  content: string;
  durationSeconds: number;
  cost: number;
  speakerCount?: number;
}

export interface GeminiTranscriptionProgress {
  status: 'downloading' | 'uploading' | 'processing' | 'completed' | 'error';
  message: string;
  percent?: number;
}

export interface EpisodeMetadata {
  title?: string;
  feedName?: string;
  feedUrl?: string;
  author?: string;
  pubDate?: string;
  duration?: string;
  episodeUrl?: string;
  description?: string;
  feedContext?: string; // Podcast-specific context from RSS feed (hosts, guests, format, etc.)
}

type ProgressCallback = (progress: GeminiTranscriptionProgress) => void;

/**
 * Format duration string (handles seconds or HH:MM:SS)
 */
function formatDuration(duration?: string): string {
  if (!duration) return '';
  
  // If it's just seconds
  if (/^\d+$/.test(duration)) {
    const totalSeconds = parseInt(duration, 10);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  return duration;
}

/**
 * Get Gemini API key from localStorage or environment
 */
function getGeminiApiKey(): string | null {
  const stored = localStorage.getItem('gemini_api_key');
  if (stored) return stored;

  // @ts-ignore - Vite env
  if (import.meta.env?.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }

  return null;
}

/**
 * Check if Gemini API key is configured
 */
export function hasGeminiApiKey(): boolean {
  return !!getGeminiApiKey();
}

/**
 * Store Gemini API key in localStorage
 */
export function setGeminiApiKey(key: string): void {
  localStorage.setItem('gemini_api_key', key);
}

/**
 * Build the transcription prompt with context
 */
function buildTranscriptionPrompt(metadata: EpisodeMetadata): string {
  let context = '';
  if (metadata.title) context += `Episode title: "${metadata.title}"\n`;
  if (metadata.feedName) context += `Podcast/Show: "${metadata.feedName}"\n`;
  if (metadata.author) context += `Author/Host: ${metadata.author}\n`;
  if (metadata.description) {
    // Truncate long descriptions to avoid overwhelming the prompt
    const desc = metadata.description.length > 500
      ? metadata.description.substring(0, 500) + '...'
      : metadata.description;
    context += `Episode description: ${desc}\n`;
  }
  if (metadata.feedContext) {
    context += `\nPodcast Context (hosts, format, common guests):\n${metadata.feedContext}\n`;
  }

  return `You are a professional transcriptionist. Transcribe this audio completely and accurately.

${context}

## Output Requirements

Output ONLY the transcript content - I will add the metadata header myself.

Your output should be clean markdown starting with:
1. **Summary:** A 2-3 sentence summary of what this episode covers
2. **Topics:** 3-5 topic tags as a comma-separated list (e.g., "entrepreneurship, technology, investing")
3. **Speakers:** List the distinct speakers you identified (be conservative - only list clearly different voices)
4. Then the full transcript with section headers

## Speaker Identification Rules

**BE CONSERVATIVE about identifying multiple speakers:**
- Only create separate speaker labels when you hear CLEARLY DISTINCT VOICES
- Do NOT assume multiple speakers just because different names are mentioned in conversation
- If someone is quoting another person or reading something, that's still the same speaker
- For solo content (lectures, monologues, solo podcasts), use a single speaker label throughout
- When uncertain, use fewer speakers rather than more

**Speaker label format:**
- Use **Name:** if you can confidently identify them from introductions or how they're addressed
- Use **Host:** and **Guest:** for interview formats where names aren't clear
- For solo monologues, you can omit speaker labels entirely
- **When uncertain about a speaker's identity, explicitly note this**: Use "**Speaker 1 (uncertain identity):**" or "**Guest (name unclear):**"
- If the podcast context provides likely speakers but you cannot confirm them in the audio, note: "**Likely [Name] but uncertain:**"

## Transcription Guidelines

1. Transcribe EVERYTHING verbatim - do not summarize or skip sections
2. Add ## section headers when the topic substantially changes
3. Preserve technical terms, names, and numbers exactly as spoken
4. Clean up obvious filler words (um, uh) but preserve the speaker's voice and style
5. Mark ads/sponsors with [AD] if clearly separate from main content

## Output Format Example

\`\`\`
**Summary:** This episode discusses X and Y. The speaker explores Z and shares insights about W.

**Topics:** topic1, topic2, topic3, topic4

**Speakers:** Name1, Name2 (or just "Solo" for single speaker)

---

## Introduction

[Transcript content here...]

## Main Topic

[More transcript...]
\`\`\`

Transcribe the FULL audio from start to finish.`;
}

/**
 * Build the final formatted output with YAML-style front matter
 */
function buildFormattedOutput(
  transcriptContent: string,
  metadata: EpisodeMetadata
): string {
  const lines: string[] = [];
  
  // Title
  lines.push(`# ${metadata.title || 'Untitled Episode'}`);
  lines.push('');
  
  // Metadata block
  if (metadata.feedName) {
    lines.push(`**Podcast:** ${metadata.feedName}`);
  }
  if (metadata.author) {
    lines.push(`**Author:** ${metadata.author}`);
  }
  if (metadata.pubDate) {
    const date = new Date(metadata.pubDate);
    lines.push(`**Date:** ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  }
  if (metadata.duration) {
    lines.push(`**Duration:** ${formatDuration(metadata.duration)}`);
  }
  if (metadata.episodeUrl) {
    lines.push(`**Link:** [Original Episode](${metadata.episodeUrl})`);
  }
  
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Transcript content (Gemini's output with Summary, Topics, Speakers, and transcript)
  lines.push(transcriptContent);
  
  return lines.join('\n');
}

/**
 * Convert Uint8Array to base64 string (browser-compatible)
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Transcribe audio using Gemini 3 Flash Preview
 * 
 * Uses inline base64 for small files, REST API upload for larger files.
 */
export async function transcribeAudioWithGemini(
  audioUrl: string,
  title?: string,
  onProgress?: ProgressCallback,
  metadata?: EpisodeMetadata
): Promise<GeminiTranscriptionResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.');
  }
  
  // Build full metadata object
  const fullMetadata: EpisodeMetadata = {
    title,
    ...metadata,
  };

  const report = (status: GeminiTranscriptionProgress['status'], message: string, percent?: number) => {
    onProgress?.({ status, message, percent });
  };

  try {
    report('downloading', 'Downloading audio file...', 10);

    // Fetch the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    const mimeType = audioBlob.type || 'audio/mpeg';

    report('uploading', 'Preparing audio for transcription...', 30);

    const prompt = buildTranscriptionPrompt(fullMetadata);
    let responseText: string;
    const startTime = Date.now();

    if (audioBytes.length <= INLINE_SIZE_LIMIT) {
      // Small file: use inline base64
      const audioBase64 = uint8ArrayToBase64(audioBytes);

      report('processing', 'Transcribing with Gemini 3 Flash...', 50);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType, data: audioBase64 } },
                { text: prompt },
              ],
            }],
            generationConfig: {
              maxOutputTokens: 65536,
              temperature: 0.1,
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Check for truncation
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        console.warn('Transcript may be truncated due to output token limit');
      }

    } else {
      // Large file: use Files API via REST
      report('uploading', 'Uploading to Gemini (large file)...', 40);

      // Step 1: Start resumable upload
      const startUploadResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': audioBytes.length.toString(),
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            file: { displayName: title || 'audio.mp3' },
          }),
        }
      );

      if (!startUploadResponse.ok) {
        throw new Error(`Failed to start upload: ${startUploadResponse.status}`);
      }

      const uploadUrl = startUploadResponse.headers.get('X-Goog-Upload-URL');
      if (!uploadUrl) {
        throw new Error('No upload URL returned');
      }

      // Step 2: Upload the file
      report('uploading', 'Uploading audio file...', 50);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Command': 'upload, finalize',
          'X-Goog-Upload-Offset': '0',
          'Content-Type': mimeType,
        },
        body: audioBytes,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${uploadResponse.status}`);
      }

      const fileInfo = await uploadResponse.json();
      const fileUri = fileInfo.file?.uri;
      const fileName = fileInfo.file?.name;

      if (!fileUri) {
        throw new Error('No file URI returned');
      }

      // Step 3: Wait for file to be processed (if needed)
      let fileState = fileInfo.file?.state;
      while (fileState === 'PROCESSING') {
        report('processing', 'Waiting for file processing...', 60);
        await new Promise(r => setTimeout(r, 3000));

        const checkResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
        );
        const checkData = await checkResponse.json();
        fileState = checkData.state;
      }

      if (fileState === 'FAILED') {
        throw new Error('File processing failed');
      }

      // Step 4: Generate content using the file
      report('processing', 'Transcribing with Gemini 3 Flash...', 70);

      const generateResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { fileData: { mimeType, fileUri } },
                { text: prompt },
              ],
            }],
            generationConfig: {
              maxOutputTokens: 65536,
              temperature: 0.1,
            },
          }),
        }
      );

      if (!generateResponse.ok) {
        const err = await generateResponse.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error: ${generateResponse.status}`);
      }

      const generateData = await generateResponse.json();
      responseText = generateData.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Step 5: Delete the uploaded file
      try {
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
          { method: 'DELETE' }
        );
      } catch {
        // Ignore cleanup errors
      }
    }

    report('completed', 'Transcription complete!', 100);

    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`Gemini transcription completed in ${processingTime.toFixed(1)}s`);

    // Extract speakers from the response
    const speakerMatches = responseText.match(/\*\*([^*]+)\*\*/g) || [];
    const uniqueSpeakers = new Set(speakerMatches.map(s => s.replace(/\*\*/g, '')));
    const speakerCount = uniqueSpeakers.size;

    // Estimate duration from word count (rough: 150 words per minute)
    const wordCount = responseText.split(/\s+/).length;
    const estimatedMinutes = wordCount / 150;
    const durationSeconds = estimatedMinutes * 60;
    const cost = (durationSeconds / 3600) * COST_PER_HOUR;

    // Build the final formatted output with front matter
    const formattedContent = buildFormattedOutput(responseText, fullMetadata);

    return {
      content: formattedContent,
      durationSeconds,
      cost,
      speakerCount,
    };
  } catch (error: any) {
    report('error', error.message);
    throw error;
  }
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
