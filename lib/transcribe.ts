/**
 * Doodle Reader - Podcast Transcription Service
 *
 * Uses AssemblyAI for audio transcription.
 * Note: Requires a backend proxy for production use (API key exposure).
 * For local development, uses a CORS proxy approach.
 */

// AssemblyAI pricing: $0.15/hour = $0.0000417/second
const COST_PER_SECOND = 0.0000417;
const POLL_INTERVAL = 3000; // 3 seconds

export interface TranscriptionResult {
  content: string;
  durationSeconds: number;
  cost: number;
  speakerCount?: number;
}

export interface TranscriptionProgress {
  status: 'downloading' | 'uploading' | 'processing' | 'completed' | 'error';
  message: string;
  percent?: number;
}

type ProgressCallback = (progress: TranscriptionProgress) => void;

/**
 * Format milliseconds to MM:SS timestamp
 */
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format AssemblyAI response into readable Markdown
 */
function formatTranscript(data: any): string {
  let md = '';

  // Add chapters if available
  if (data.chapters && data.chapters.length > 0) {
    md += `## Episode Breakdown\n\n`;
    data.chapters.forEach((c: any) => {
      const start = formatTime(c.start);
      md += `- **${start}** ${c.headline}\n  _${c.gist}_\n`;
    });
    md += `\n---\n\n`;
  }

  // Add transcript with speaker labels
  md += `## Transcript\n\n`;
  if (data.utterances && data.utterances.length > 0) {
    data.utterances.forEach((u: any) => {
      const time = formatTime(u.start);
      md += `**Speaker ${u.speaker}** (${time}): ${u.text}\n\n`;
    });
  } else {
    md += data.text;
  }

  return md;
}

/**
 * Get API key from local storage or environment
 */
function getApiKey(): string | null {
  // Try localStorage first (user-provided)
  const stored = localStorage.getItem('assemblyai_api_key');
  if (stored) return stored;

  // For development, check if there's an env var exposed
  // @ts-ignore - Vite env
  if (import.meta.env?.VITE_ASSEMBLYAI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_ASSEMBLYAI_API_KEY;
  }

  return null;
}

/**
 * Store API key in localStorage
 */
export function setApiKey(key: string): void {
  localStorage.setItem('assemblyai_api_key', key);
}

/**
 * Check if API key is configured
 */
export function hasApiKey(): boolean {
  return !!getApiKey();
}

/**
 * Transcribe audio from URL using AssemblyAI
 *
 * Note: This requires either:
 * 1. A CORS proxy for AssemblyAI API calls
 * 2. A backend endpoint that handles the API calls
 *
 * For now, we'll use a simple approach that works in development.
 */
export async function transcribeAudio(
  audioUrl: string,
  onProgress?: ProgressCallback
): Promise<TranscriptionResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('AssemblyAI API key not configured. Go to Settings to add your key.');
  }

  const report = (status: TranscriptionProgress['status'], message: string, percent?: number) => {
    onProgress?.({ status, message, percent });
  };

  try {
    // Step 1: Start transcription directly with audio URL
    // AssemblyAI can fetch public URLs directly, no need to upload
    report('processing', 'Starting transcription...', 10);

    const startResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        auto_chapters: false,
        punctuate: true,
        format_text: true,
      }),
    });

    if (!startResponse.ok) {
      const err = await startResponse.json().catch(() => ({ error: startResponse.statusText }));
      throw new Error(err.error || `AssemblyAI API Error: ${startResponse.status}`);
    }

    const { id: transcriptId } = await startResponse.json();
    report('processing', 'Transcription queued...', 20);

    // Step 2: Poll for completion
    let status = 'queued';
    let transcriptData: any = null;
    let pollCount = 0;

    while (status !== 'completed' && status !== 'error') {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      pollCount++;

      const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'Authorization': apiKey },
      });

      if (!pollResponse.ok) {
        throw new Error('Failed to check transcription status');
      }

      const pollResult = await pollResponse.json();
      status = pollResult.status;

      // Estimate progress based on status
      let percent = 20 + Math.min(pollCount * 5, 70);
      if (status === 'processing') {
        report('processing', 'Processing audio...', percent);
      } else if (status === 'completed') {
        transcriptData = pollResult;
        report('completed', 'Transcription complete!', 100);
      } else if (status === 'error') {
        throw new Error(pollResult.error || 'Transcription failed');
      } else {
        report('processing', `Status: ${status}...`, percent);
      }
    }

    // Step 3: Format and return
    const content = formatTranscript(transcriptData);
    const durationSeconds = transcriptData.audio_duration || 0;
    const cost = durationSeconds * COST_PER_SECOND;
    const speakerCount = transcriptData.utterances
      ? new Set(transcriptData.utterances.map((u: any) => u.speaker)).size
      : 1;

    return {
      content,
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

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
