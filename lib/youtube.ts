import { fetchRawContent } from './rss';

// Configuration for the local yt-dlp transcript service
const YT_TRANSCRIPT_SERVICE_URL = 'http://localhost:3002';

/**
 * Strategy 0: Use local yt-dlp service (MOST RELIABLE - gets auto-captions)
 * Requires: npm start in projects/yt-transcript-service/
 */
async function tryLocalYtDlpService(videoId: string): Promise<string | null> {
  try {
    console.log(`[YouTube] Trying local yt-dlp service for ${videoId}...`);

    const response = await fetch(
      `${YT_TRANSCRIPT_SERVICE_URL}/transcript?v=${videoId}`,
      { signal: AbortSignal.timeout(60000) } // 60s timeout for yt-dlp
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.log(`[YouTube] yt-dlp service error:`, error);
      return null;
    }

    const data = await response.json();
    if (data.transcript && data.transcript.length > 0) {
      console.log(`[YouTube] Got ${data.length} chars from yt-dlp service`);
      return data.transcript;
    }

    return null;
  } catch (e: any) {
    // Service not running or network error
    if (e.name === 'TypeError' && e.message.includes('fetch')) {
      console.log('[YouTube] yt-dlp service not running (start with: cd projects/yt-transcript-service && npm start)');
    } else {
      console.log('[YouTube] yt-dlp service failed:', e.message);
    }
    return null;
  }
}

/**
 * Parse XML caption response into clean text
 */
function parseTranscriptXml(xml: string): string | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, "text/xml");
    const textNodes = xmlDoc.getElementsByTagName('text');

    if (textNodes.length === 0) return null;

    const seen = new Set<string>();
    const lines: string[] = [];

    for (let i = 0; i < textNodes.length; i++) {
      let line = textNodes[i].textContent || '';

      // Clean HTML tags and entities
      line = line.replace(/<[^>]*>/g, '');
      line = line.replace(/&amp;/g, '&')
                 .replace(/&gt;/g, '>')
                 .replace(/&lt;/g, '<')
                 .replace(/&quot;/g, '"')
                 .replace(/&#39;/g, "'")
                 .replace(/\n/g, ' ');

      line = line.trim();

      // Deduplicate - YouTube captions often repeat with overlapping timestamps
      if (line && !seen.has(line)) {
        lines.push(line);
        seen.add(line);
      }
    }

    return lines.length > 0 ? lines.join(' ') : null;
  } catch (e) {
    console.error("[YouTube] XML parse failed:", e);
    return null;
  }
}

/**
 * Strategy 1: Use a third-party transcript API (most reliable)
 */
async function tryTranscriptApi(videoId: string): Promise<string | null> {
  try {
    // Using a public transcript API
    const apiUrl = `https://yt.lemnoslife.com/noKey/captions?videoId=${videoId}&lang=en`;
    console.log(`[YouTube] Trying transcript API for ${videoId}...`);
    
    const response = await fetch(apiUrl);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // This API returns captions in a structured format
    if (data && Array.isArray(data)) {
      const lines = data.map((item: any) => item.text || '').filter(Boolean);
      if (lines.length > 0) {
        console.log(`[YouTube] Got ${lines.length} lines from transcript API`);
        return lines.join(' ');
      }
    }
    
    return null;
  } catch (e) {
    console.log("[YouTube] Transcript API failed:", e);
    return null;
  }
}

/**
 * Strategy 2: Scrape from YouTube page via CORS proxy
 */
async function tryPageScrape(videoId: string): Promise<string | null> {
  try {
    const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[YouTube] Trying page scrape for ${videoId}...`);

    const pageHtml = await fetchRawContent(videoPageUrl);

    // Look for "captionTracks" in the page
    const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);

    if (!captionMatch || !captionMatch[1]) {
      console.log("[YouTube] No captionTracks in page source");
      return null;
    }

    const tracks = JSON.parse(captionMatch[1]);

    // Priority: manual English → auto-generated English → any English → first
    const manualTrack = tracks.find((t: any) => t.languageCode === 'en' && t.kind !== 'asr');
    const autoTrack = tracks.find((t: any) => t.languageCode === 'en' && t.kind === 'asr');
    const anyEnglish = tracks.find((t: any) => t.languageCode === 'en');
    const track = manualTrack || autoTrack || anyEnglish || tracks[0];

    if (!track || !track.baseUrl) return null;

    console.log(`[YouTube] Found caption track: ${track.name?.simpleText || 'unknown'}`);

    const transcriptXml = await fetchRawContent(track.baseUrl);
    return parseTranscriptXml(transcriptXml);
  } catch (e) {
    console.log("[YouTube] Page scrape failed:", e);
    return null;
  }
}

/**
 * Strategy 3: Try YouTube's innertube API (what the site uses internally)
 */
async function tryInnertubeApi(videoId: string): Promise<string | null> {
  try {
    console.log(`[YouTube] Trying innertube API for ${videoId}...`);
    
    // First get the video page to extract necessary tokens
    const pageHtml = await fetchRawContent(`https://www.youtube.com/watch?v=${videoId}`);
    
    // Look for the serialized player response
    const playerMatch = pageHtml.match(/var ytInitialPlayerResponse\s*=\s*({.*?});/);
    if (!playerMatch) return null;
    
    const playerResponse = JSON.parse(playerMatch[1]);
    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captions || captions.length === 0) return null;
    
    // Find best track
    const track = captions.find((t: any) => t.languageCode === 'en') || captions[0];
    if (!track?.baseUrl) return null;
    
    const transcriptXml = await fetchRawContent(track.baseUrl);
    return parseTranscriptXml(transcriptXml);
  } catch (e) {
    console.log("[YouTube] Innertube API failed:", e);
    return null;
  }
}

/**
 * Main function: tries multiple strategies to get transcript
 *
 * Priority:
 * 1. Local yt-dlp service (most reliable, gets auto-captions)
 * 2. Third-party API
 * 3. Page scrape via CORS proxy
 * 4. Innertube API
 */
export async function getTranscript(videoId: string): Promise<string | null> {
  console.log(`[YouTube] Fetching transcript for ${videoId}...`);

  // Strategy 0: Local yt-dlp service (BEST - gets auto-captions reliably)
  let transcript = await tryLocalYtDlpService(videoId);
  if (transcript) {
    console.log("[YouTube] Success via local yt-dlp service");
    return transcript;
  }

  // Strategy 1: Third-party API
  transcript = await tryTranscriptApi(videoId);
  if (transcript) {
    console.log("[YouTube] Success via transcript API");
    return transcript;
  }

  // Strategy 2: Page scrape via CORS proxy
  transcript = await tryPageScrape(videoId);
  if (transcript) {
    console.log("[YouTube] Success via page scrape");
    return transcript;
  }

  // Strategy 3: Innertube API approach
  transcript = await tryInnertubeApi(videoId);
  if (transcript) {
    console.log("[YouTube] Success via innertube");
    return transcript;
  }

  console.warn("[YouTube] All strategies failed. Try starting the yt-dlp service:");
  console.warn("  cd projects/yt-transcript-service && npm start");
  return null;
}