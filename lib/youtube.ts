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
 * Strategy 4: Try downsub.com API (reliable fallback for many videos)
 */
async function tryDownsubApi(videoId: string): Promise<string | null> {
  try {
    console.log(`[YouTube] Trying downsub.com API for ${videoId}...`);
    
    // First, get the available subtitles
    const infoUrl = `https://downsub.com/?url=https://www.youtube.com/watch?v=${videoId}`;
    const pageHtml = await fetchRawContent(infoUrl);
    
    // Look for English subtitle download link
    const downloadMatch = pageHtml.match(/href="([^"]*)"[^>]*>DOWNLOAD[^<]*<[^>]*>\s*English/);
    if (!downloadMatch || !downloadMatch[1]) {
      console.log('[YouTube] No English subtitles found on downsub');
      return null;
    }
    
    const downloadUrl = downloadMatch[1].replace(/&amp;/g, '&');
    const srtContent = await fetchRawContent(`https://downsub.com${downloadUrl}`);
    
    // Parse SRT format
    const lines = srtContent.split('\n');
    const textLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip index numbers and timestamps
      if (line && !line.match(/^\d+$/) && !line.includes('-->')) {
        textLines.push(line);
      }
    }
    
    return textLines.join(' ');
  } catch (e) {
    console.log('[YouTube] Downsub API failed:', e);
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
 * 5. Downsub API (good fallback)
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

  // Strategy 4: Downsub API (good for many videos)
  transcript = await tryDownsubApi(videoId);
  if (transcript) {
    console.log("[YouTube] Success via downsub API");
    return transcript;
  }

  console.warn("[YouTube] All strategies failed. Try starting the yt-dlp service:");
  console.warn("  cd projects/yt-transcript-service && npm start");
  return null;
}

/**
 * YouTube video metadata
 */
export interface YouTubeMetadata {
  videoId: string;
  title: string;
  author: string;
  authorUrl?: string;
  description: string;
  publishedAt?: string;
  duration?: string;
  thumbnailUrl?: string;
  viewCount?: string;
  likeCount?: string;
}

/**
 * Fetch YouTube video metadata using oEmbed API
 * This is a reliable, official API that doesn't require authentication
 */
async function fetchYouTubeOEmbed(videoId: string): Promise<Partial<YouTubeMetadata> | null> {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    
    console.log(`[YouTube] Fetching oEmbed metadata for ${videoId}...`);
    
    const response = await fetchRawContent(oEmbedUrl);
    const data = JSON.parse(response);
    
    return {
      title: data.title || '',
      author: data.author_name || '',
      authorUrl: data.author_url || '',
      thumbnailUrl: data.thumbnail_url || '',
      // oEmbed doesn't provide description, duration, or view count
    };
  } catch (e) {
    console.log('[YouTube] oEmbed fetch failed:', e);
    return null;
  }
}

/**
 * Extract metadata from YouTube page HTML
 */
async function extractMetadataFromPage(videoId: string): Promise<Partial<YouTubeMetadata> | null> {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[YouTube] Extracting metadata from page for ${videoId}...`);
    
    const pageHtml = await fetchRawContent(videoUrl);
    
    // Extract from structured data (JSON-LD)
    const jsonLdMatch = pageHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch && jsonLdMatch[1]) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        if (jsonData['@type'] === 'VideoObject') {
          return {
            title: jsonData.name || '',
            description: jsonData.description || '',
            publishedAt: jsonData.uploadDate || jsonData.datePublished || '',
            thumbnailUrl: jsonData.thumbnailUrl?.[0] || '',
            duration: jsonData.duration || '', // ISO 8601 duration
          };
        }
      } catch (e) {
        console.log('[YouTube] JSON-LD parse failed:', e);
      }
    }
    
    // Extract from meta tags
    const metadata: Partial<YouTubeMetadata> = {};
    
    // Title
    const titleMatch = pageHtml.match(/<meta property="og:title" content="([^"]*)">/);
    if (titleMatch) metadata.title = titleMatch[1];
    
    // Description
    const descMatch = pageHtml.match(/<meta property="og:description" content="([^"]*)">/);
    if (descMatch) metadata.description = descMatch[1];
    
    // Channel name
    const channelMatch = pageHtml.match(/<link itemprop="name" content="([^"]*)">/);
    if (channelMatch) metadata.author = channelMatch[1];
    
    // View count from watch-info
    const viewMatch = pageHtml.match(/"viewCount":"(\d+)"/);
    if (viewMatch) metadata.viewCount = viewMatch[1];
    
    // Published date
    const dateMatch = pageHtml.match(/"publishDate":"([^"]*)"/) || pageHtml.match(/"uploadDate":"([^"]*)"/);
    if (dateMatch) metadata.publishedAt = dateMatch[1];
    
    return Object.keys(metadata).length > 0 ? metadata : null;
  } catch (e) {
    console.log('[YouTube] Page metadata extraction failed:', e);
    return null;
  }
}

/**
 * Get comprehensive YouTube video metadata
 * Tries multiple strategies and combines results
 */
export async function getVideoMetadata(videoId: string): Promise<YouTubeMetadata> {
  console.log(`[YouTube] Fetching metadata for ${videoId}...`);
  
  // Start with defaults
  const metadata: YouTubeMetadata = {
    videoId,
    title: `Video ${videoId}`,
    author: 'Unknown Channel',
    description: '',
  };
  
  // Try local yt-dlp service first (most comprehensive)
  try {
    const infoResponse = await fetch(
      `${YT_TRANSCRIPT_SERVICE_URL}/info?v=${videoId}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (infoResponse.ok) {
      const info = await infoResponse.json();
      if (info.title) metadata.title = info.title;
      if (info.channel) metadata.author = info.channel;
      if (info.channelUrl) metadata.authorUrl = info.channelUrl;
      if (info.description) metadata.description = info.description;
      if (info.duration) metadata.duration = info.duration;
      if (info.thumbnail) metadata.thumbnailUrl = info.thumbnail;
      if (info.uploadDate) metadata.publishedAt = info.uploadDate;
      if (info.viewCount) metadata.viewCount = info.viewCount;
      
      console.log('[YouTube] Got full metadata from yt-dlp service');
      return metadata;
    }
  } catch (e) {
    console.log('[YouTube] yt-dlp info service not available');
  }
  
  // Try oEmbed API (official, reliable for basic info)
  const oEmbedData = await fetchYouTubeOEmbed(videoId);
  if (oEmbedData) {
    Object.assign(metadata, oEmbedData);
    console.log('[YouTube] Got basic metadata from oEmbed');
  }
  
  // Try extracting from page for additional details
  const pageData = await extractMetadataFromPage(videoId);
  if (pageData) {
    // Merge, preferring non-empty values
    if (pageData.title && !metadata.title) metadata.title = pageData.title;
    if (pageData.description) metadata.description = pageData.description;
    if (pageData.publishedAt) metadata.publishedAt = pageData.publishedAt;
    if (pageData.duration) metadata.duration = pageData.duration;
    if (pageData.viewCount) metadata.viewCount = pageData.viewCount;
    console.log('[YouTube] Enhanced metadata from page extraction');
  }
  
  return metadata;
}

/**
 * Polish a YouTube transcript using Gemini with video metadata as context
 */
export async function polishYouTubeTranscript(
  videoId: string,
  rawTranscript: string,
  onProgress?: (message: string) => void
): Promise<string> {
  // Import polish function dynamically to avoid circular dependency
  const { polishTranscript } = await import('./polish');
  
  // Get video metadata for context
  onProgress?.('Fetching video metadata...');
  const metadata = await getVideoMetadata(videoId);
  
  // Build context prompt with video information
  const contextPrompt = `# YouTube Video Context

## Video Information
- **Title**: ${metadata.title}
- **Channel**: ${metadata.author}
- **Published**: ${metadata.publishedAt || 'Unknown'}
${metadata.description ? `- **Description**: ${metadata.description.substring(0, 500)}...` : ''}

## Notes
- This is a YouTube video transcript
- Auto-generated captions may have errors with names, technical terms, or punctuation
- The video description above may contain important context about topics, guests, or terminology
- If the channel name is visible, use it to identify the main speaker/host
- YouTube auto-captions often lack speaker labels - infer them from context when possible`;

  onProgress?.('Polishing transcript with AI...');
  
  // Polish the transcript with video context
  const polishedTranscript = await polishTranscript(
    rawTranscript,
    contextPrompt,
    metadata.title
  );
  
  return polishedTranscript;
}