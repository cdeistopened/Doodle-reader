import { fetchRawContent } from './rss';

/**
 * Fetch YouTube transcript via serverless function (avoids CORS)
 */
export async function getTranscript(videoId: string): Promise<string | null> {
  console.log(`[YouTube] Fetching transcript for ${videoId}...`);

  try {
    // Use serverless function to avoid CORS issues
    const functionUrl = `/.netlify/functions/youtube-transcript?videoId=${videoId}`;
    
    const response = await fetch(functionUrl);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[YouTube] No transcript available for this video');
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.transcript && data.transcript.length > 50) {
      console.log(`[YouTube] Got ${data.transcript.length} characters (${data.segments} segments)`);
      return data.transcript;
    }
    
    return null;
  } catch (error: any) {
    console.log(`[YouTube] Transcript fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Get YouTube video metadata (title, description, channel, etc.)
 * Uses oEmbed API which is reliable and doesn't require API keys
 */
export async function getVideoMetadata(videoId: string) {
  try {
    console.log(`[YouTube] Fetching metadata for ${videoId}...`);

    // Use YouTube's oEmbed API (official, no auth required)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      console.log(`[YouTube] oEmbed failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    return {
      title: data.title || 'Unknown Title',
      author: data.author_name || 'Unknown Channel',
      authorUrl: data.author_url || `https://www.youtube.com/channel/${data.author_name}`,
      thumbnail: data.thumbnail_url || '',
      description: '', // oEmbed doesn't provide description, we'll need to scrape for this
      publishedAt: '', // Not available in oEmbed
      duration: '', // Not available in oEmbed
      viewCount: '', // Not available in oEmbed
    };
  } catch (error: any) {
    console.log(`[YouTube] Metadata fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Get enhanced video metadata by scraping the page
 * Fallback when oEmbed doesn't provide enough info
 */
export async function getEnhancedMetadata(videoId: string) {
  try {
    console.log(`[YouTube] Fetching enhanced metadata for ${videoId}...`);
    
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const html = await fetchRawContent(url);
    
    // Extract metadata from page HTML
    const titleMatch = html.match(/<meta name="title" content="([^"]+)"/);
    const descriptionMatch = html.match(/<meta name="description" content="([^"]+)"/);
    const authorMatch = html.match(/"author":"([^"]+)"/);
    const viewCountMatch = html.match(/"viewCount":"(\d+)"/);
    const publishedMatch = html.match(/"publishDate":"([^"]+)"/);
    
    return {
      title: titleMatch ? titleMatch[1] : 'Unknown Title',
      description: descriptionMatch ? descriptionMatch[1] : '',
      author: authorMatch ? authorMatch[1] : 'Unknown Channel',
      viewCount: viewCountMatch ? parseInt(viewCountMatch[1]).toLocaleString() : '',
      publishedAt: publishedMatch ? publishedMatch[1] : '',
    };
  } catch (error: any) {
    console.log(`[YouTube] Enhanced metadata fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Polish YouTube transcript with video context
 */
export async function polishYouTubeTranscript(videoId: string, rawTranscript: string) {
  try {
    // Get video metadata for context
    const metadata = await getVideoMetadata(videoId);
    const enhanced = await getEnhancedMetadata(videoId);
    
    const title = enhanced?.title || metadata?.title || 'Unknown Video';
    const author = enhanced?.author || metadata?.author || 'Unknown Channel';
    const description = enhanced?.description || '';
    
    // Build context prompt
    const context = `Video: "${title}" by ${author}${description ? `\nDescription: ${description.substring(0, 500)}` : ''}`;
    
    // Use existing polishing infrastructure with context
    const { polishTranscript } = await import('./polish');
    return await polishTranscript(rawTranscript, undefined, context);
    
  } catch (error: any) {
    console.log(`[YouTube] Transcript polishing failed: ${error.message}`);
    throw error;
  }
}