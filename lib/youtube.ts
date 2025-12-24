import { fetchRawContent } from './rss';

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
 */
export async function getTranscript(videoId: string): Promise<string | null> {
  console.log(`[YouTube] Fetching transcript for ${videoId}...`);
  
  // Strategy 1: Third-party API (most reliable, no CORS issues)
  let transcript = await tryTranscriptApi(videoId);
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
  
  console.warn("[YouTube] All strategies failed");
  return null;
}