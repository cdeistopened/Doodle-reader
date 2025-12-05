import { fetchRawContent } from './rss';

/**
 * Attempts to scrape the raw transcript from a YouTube video page via proxy.
 * This mimics what yt-dlp does but in a very simplified way suitable for the browser.
 */
export async function getTranscript(videoId: string): Promise<string | null> {
  try {
    const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[YouTube] Fetching page source for ${videoId}...`);
    
    // 1. Fetch the video page HTML
    const pageHtml = await fetchRawContent(videoPageUrl);

    // 2. Extract the 'captions' JSON object which YouTube embeds in the page
    // Look for "captionTracks"
    const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
    
    if (!captionMatch || !captionMatch[1]) {
      console.warn("[YouTube] No captionTracks found in page source.");
      return null;
    }

    const tracks = JSON.parse(captionMatch[1]);
    
    // 3. Find English track or auto-generated one
    const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
    
    if (!track || !track.baseUrl) {
      return null;
    }

    console.log(`[YouTube] Found caption track: ${track.name?.simpleText}`);
    
    // 4. Fetch the XML transcript
    const transcriptXml = await fetchRawContent(track.baseUrl);
    
    // 5. Parse XML to Text
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptXml, "text/xml");
    const textNodes = xmlDoc.getElementsByTagName('text');
    
    let fullTranscript = '';
    for (let i = 0; i < textNodes.length; i++) {
      const line = textNodes[i].textContent;
      // formatting slightly to help AI
      fullTranscript += line + " ";
    }

    return fullTranscript;

  } catch (e) {
    console.error("[YouTube] Scraper failed:", e);
    return null;
  }
}