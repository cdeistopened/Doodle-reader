/**
 * Doodle Reader - Gemini Audio Transcription Service
 *
 * Uses Google Gemini 3 Flash for audio transcription.
 * Faster and cheaper than AssemblyAI but without speaker diarization.
 */

import { GoogleGenAI } from "@google/genai";

// Gemini pricing estimate: ~$0.01/hour for audio
const COST_PER_HOUR = 0.01;

export interface GeminiTranscriptionResult {
  content: string;
  durationSeconds: number;
  cost: number;
}

export interface GeminiTranscriptionProgress {
  status: 'downloading' | 'processing' | 'completed' | 'error';
  message: string;
  percent?: number;
}

type ProgressCallback = (progress: GeminiTranscriptionProgress) => void;

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
 * Transcribe audio using Gemini 3 Flash
 *
 * Note: Gemini can process audio directly via URL.
 */
export async function transcribeAudioWithGemini(
  audioUrl: string,
  title?: string,
  onProgress?: ProgressCallback
): Promise<GeminiTranscriptionResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.');
  }

  const report = (status: GeminiTranscriptionProgress['status'], message: string, percent?: number) => {
    onProgress?.({ status, message, percent });
  };

  try {
    report('downloading', 'Downloading audio file...', 10);

    // Fetch the audio file to get it as a blob
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioBase64 = btoa(
      new Uint8Array(audioBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    report('processing', 'Sending to Gemini for transcription...', 30);

    const ai = new GoogleGenAI({ apiKey });

    // Determine MIME type
    const mimeType = audioBlob.type || 'audio/mpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            {
              text: `Please transcribe this audio file completely and accurately.

${title ? `This is from a podcast episode titled: "${title}"` : ''}

Format the transcript as clean, readable text with:
- Proper paragraphs (break at natural pauses or topic changes)
- Punctuation and capitalization
- Speaker changes indicated with line breaks (you may use "Speaker:" labels if you can identify different voices)

Do NOT include:
- Timestamps
- "[Music]" or "[Applause]" annotations unless they're important context
- Commentary about the audio quality

Just provide the clean transcript text.`,
            },
          ],
        },
      ],
    });

    report('completed', 'Transcription complete!', 100);

    const content = response.text || '';

    // Estimate duration based on content length (rough: 150 words per minute)
    const wordCount = content.split(/\s+/).length;
    const estimatedMinutes = wordCount / 150;
    const durationSeconds = estimatedMinutes * 60;
    const cost = (durationSeconds / 3600) * COST_PER_HOUR;

    return {
      content: `## Transcript\n\n${content}`,
      durationSeconds,
      cost,
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
