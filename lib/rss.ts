import { FeedItem, FeedSource } from '../types';

// Priority list of CORS proxies
// 1. Own server proxy - Works for all feeds including blocked ones (Megaphone, etc)
// 2. corsproxy.io - Fallback for dev without server
// 3. allorigins.win/raw - Last resort
const PROXY_STRATEGIES = [
  (url: string) => `/api/feed?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

/**
 * Robust fetcher that tries multiple proxies and handles text/json responses.
 * Provides detailed error information for debugging feed issues.
 */
export async function fetchRawContent(targetUrl: string): Promise<string> {
  const errors: { proxy: string; error: string }[] = [];

  for (let i = 0; i < PROXY_STRATEGIES.length; i++) {
    const strategy = PROXY_STRATEGIES[i];
    const proxyName = i === 0 ? 'server' : i === 1 ? 'corsproxy.io' : 'allorigins';

    try {
      const proxyUrl = strategy(targetUrl);
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      if (!response.ok) {
        const statusText = response.statusText || 'Unknown error';
        throw new Error(`HTTP ${response.status}: ${statusText}`);
      }

      const text = await response.text();

      // Check for empty responses
      if (!text || text.trim().length === 0) {
        throw new Error('Empty response received');
      }

      // Check for HTML error pages (some proxies return these)
      if (text.includes('<!DOCTYPE html>') && text.includes('error')) {
        throw new Error('Proxy returned an error page');
      }

      return text;
    } catch (e: any) {
      const errorMsg = e.name === 'TimeoutError' ? 'Request timed out (15s)' : e.message;
      console.warn(`[RSS] Proxy ${proxyName} failed for ${targetUrl}:`, errorMsg);
      errors.push({ proxy: proxyName, error: errorMsg });
      // Continue to next strategy
    }
  }

  // Build informative error message
  const errorDetails = errors.map(e => `${e.proxy}: ${e.error}`).join('; ');
  throw new Error(`Failed to fetch feed. The feed URL may be invalid, blocked, or temporarily unavailable. (${errorDetails})`);
}

/**
 * Search the Feedly Cloud API for a feed url
 */
async function searchFeedly(query: string): Promise<string | null> {
  try {
    // We proxy this request too
    const searchUrl = `https://cloud.feedly.com/v3/search/feeds?query=${encodeURIComponent(query)}`;
    const jsonStr = await fetchRawContent(searchUrl);
    const data = JSON.parse(jsonStr);
    
    if (data.results && data.results.length > 0) {
      // Feedly returns ids like "feed/https://..."
      const feedId = data.results[0].feedId;
      return feedId.replace(/^feed\//, '');
    }
  } catch (e) {
    console.warn("Feedly search failed", e);
  }
  return null;
}

const isYoutubeUrl = (url: string) => {
  return url.includes('youtube.com') || url.includes('youtu.be');
};

/**
 * Generate a basic context prompt for transcript polishing based on feed metadata
 */
const generateContextPrompt = (title: string, description: string, author: string): string => {
  let context = `# ${title}\n\n`;

  if (description) {
    context += `## About\n${description}\n\n`;
  }

  if (author) {
    context += `## Host\n- **${author}**\n\n`;
  }

  context += `## Notes\nThis is a podcast feed. Speaker names and technical terms should be preserved accurately.`;

  return context;
};

export const fetchFeed = async (inputUrl: string): Promise<{ source: FeedSource, items: FeedItem[] }> => {
  let url = inputUrl.trim();
  let content = '';

  // Validate URL format
  if (!url) {
    throw new Error('Please enter a feed URL or search term');
  }

  // 1. Heuristic: If input looks like a search term (no dots or slashes), search immediately
  if (!url.includes('.') || !url.includes('/')) {
    console.log(`[RSS] Input '${url}' looks like a search term. Querying directory...`);
    const found = await searchFeedly(url);
    if (found) {
      url = found;
    } else {
      throw new Error(`Could not find a feed for "${inputUrl}". Try searching by podcast/site name or paste the RSS URL directly.`);
    }
  }

  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // 2. Try fetching the content
  try {
    content = await fetchRawContent(url);
  } catch (e) {
    // If direct fetch fails, it might be a domain that needs discovery (e.g. theneurondaily.com -> finds feed)
    // Or it might be blocked. Let's try searching Feedly as a fallback for the URL.
    console.log(`[RSS] Direct fetch failed for ${url}. Attempting directory search fallback...`);
    const found = await searchFeedly(url);
    if (found && found !== url) {
      console.log(`[RSS] Found alternate feed via directory: ${found}`);
      url = found;
      content = await fetchRawContent(url);
    } else {
      throw e;
    }
  }

  // 3. Parse content
  const parser = new DOMParser();
  let xmlDoc = parser.parseFromString(content, "text/xml");
  const parseError = xmlDoc.querySelector('parsererror');

  // 4. Auto-Discovery: If not valid XML, treat as HTML and look for links
  if (parseError || (xmlDoc.getElementsByTagName('rss').length === 0 && xmlDoc.getElementsByTagName('feed').length === 0)) {
    console.log(`[RSS] URL ${url} is not an XML feed. Scanning for links...`);
    const htmlDoc = parser.parseFromString(content, "text/html");
    
    const feedLinks = Array.from(htmlDoc.querySelectorAll('link[rel="alternate"]'))
      .filter(link => {
        const type = link.getAttribute('type');
        return type && (type.includes('rss') || type.includes('atom') || type.includes('xml'));
      });

    if (feedLinks.length > 0) {
      const href = feedLinks[0].getAttribute('href');
      if (href) {
        let nextUrl = href;
        // Handle relative URLs
        if (!href.startsWith('http')) {
           try {
             nextUrl = new URL(href, url).href;
           } catch (e) {
             const origin = new URL(url).origin;
             nextUrl = origin + (href.startsWith('/') ? '' : '/') + href;
           }
        }
        
        console.log(`[RSS] Discovered linked feed: ${nextUrl}`);
        if (nextUrl !== inputUrl) { // Prevent infinite recursion if self-referential
           return fetchFeed(nextUrl);
        }
      }
    }
    
    // Fallback: If we haven't tried searching Feedly yet (i.e. input was a full URL), try now
    if (inputUrl.includes('.')) {
        const found = await searchFeedly(inputUrl);
        if (found && found !== inputUrl) {
            return fetchFeed(found);
        }
    }

    throw new Error("No valid RSS/Atom feed found. Please try a specific feed URL.");
  }

  // --- PARSING (Standardized Atom/RSS) ---

  const isAtom = xmlDoc.getElementsByTagName('feed').length > 0;
  const channel = isAtom ? xmlDoc.getElementsByTagName('feed')[0] : xmlDoc.getElementsByTagName('channel')[0];

  const title = getTagValue(channel, 'title') || 'Unknown Feed';
  const description = getTagValue(channel, 'description') || getTagValue(channel, 'subtitle') || '';
  const feedAuthor = getTagValue(channel, 'itunes:author') || getTagValue(channel, 'author') || getTagValue(channel, 'managingEditor') || '';

  // Site URL
  let siteUrl = '';
  if (isAtom) {
      const links = Array.from(channel.getElementsByTagName('link'));
      const altLink = links.find(l => l.getAttribute('rel') === 'alternate' || !l.getAttribute('rel'));
      if (altLink) siteUrl = altLink.getAttribute('href') || '';
  } else {
      siteUrl = getTagValue(channel, 'link');
  }

  // Favicon
  const domain = siteUrl ? new URL(siteUrl).hostname : new URL(url).hostname;
  const icon = `https://www.google.com/s2/favicons?domain=${domain}`;

  const feedId = generateId(url);

  // Check if this is a podcast feed (has iTunes namespace or enclosures in items)
  const hasItunesNs = content.includes('xmlns:itunes') || content.includes('itunes:');
  const hasEnclosures = content.includes('<enclosure');
  const isPodcastFeed = hasItunesNs || hasEnclosures;

  const source: FeedSource = {
    id: feedId,
    url: url,
    siteUrl,
    name: title,
    icon,
    color: stringToColor(title),
    // Auto-generate context prompt for podcast feeds
    contextPrompt: isPodcastFeed ? generateContextPrompt(title, description, feedAuthor) : undefined,
  };

  const xmlItems = Array.from(isAtom ? xmlDoc.getElementsByTagName('entry') : xmlDoc.getElementsByTagName('item'));
  const items: FeedItem[] = [];

  xmlItems.forEach(node => {
    const itemTitle = getTagValue(node, 'title') || '(No Title)';
    const itemLink = isAtom ? getAtomLink(node) : getTagValue(node, 'link');

    const itunesSummary = getTagValue(node, 'itunes:summary');
    const itunesSubtitle = getTagValue(node, 'itunes:subtitle');
    const regularDescription = getTagValue(node, 'description');
    const contentEncoded = getTagValue(node, 'content:encoded');
    const mediaDescription = getTagValue(node, 'media:description');
    
    const itemContent = itunesSummary || 
                        contentEncoded ||
                        getTagValue(node, 'content') ||
                        mediaDescription ||
                        regularDescription ||
                        getTagValue(node, 'summary') || '';

    let rawSnippet = mediaDescription || regularDescription || itunesSummary || getTagValue(node, 'summary');
    if (itunesSubtitle && itunesSubtitle !== rawSnippet) {
      rawSnippet = itunesSubtitle + (rawSnippet ? ' - ' + rawSnippet : '');
    }
    if (!rawSnippet || rawSnippet.length < 10) rawSnippet = itemContent;

    // Clean garbage (CSS/JS)
    const itemSnippet = stripHtml(rawSnippet).substring(0, 160).trim();

    // Author strategies
    const author = getTagValue(node, 'dc:creator') || getTagValue(node, 'author') || getTagValue(node, 'name') || title;

    // Date strategies
    let dateStr = getTagValue(node, 'pubDate') || getTagValue(node, 'updated') || getTagValue(node, 'dc:date');
    const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();

    const uniqueString = itemLink || (itemTitle + timestamp);
    const itemId = generateId(uniqueString);

    // YouTube / Video Detection
    const isVideo = isYoutubeUrl(itemLink) || isYoutubeUrl(url);

    // Podcast / Audio Detection - look for enclosure with audio type
    const enclosure = node.getElementsByTagName('enclosure')[0];
    let audioUrl: string | undefined;
    let duration: string | undefined;
    let isAudio = false;

    if (enclosure) {
      const enclosureType = enclosure.getAttribute('type') || '';
      const enclosureUrl = enclosure.getAttribute('url') || '';
      if (enclosureType.includes('audio') || enclosureUrl.match(/\.(mp3|m4a|wav|ogg|aac)(\?|$)/i)) {
        audioUrl = enclosureUrl;
        isAudio = true;
      }
    }

    // Also check for media:content (used by some podcast feeds)
    if (!audioUrl) {
      const mediaContent = node.getElementsByTagName('media:content')[0];
      if (mediaContent) {
        const mediaType = mediaContent.getAttribute('type') || '';
        const mediaUrl = mediaContent.getAttribute('url') || '';
        if (mediaType.includes('audio') || mediaUrl.match(/\.(mp3|m4a|wav|ogg|aac)(\?|$)/i)) {
          audioUrl = mediaUrl;
          isAudio = true;
        }
      }
    }

    // Get duration from iTunes namespace or regular duration tag
    // Normalize to seconds for consistent sorting
    const rawDuration = getTagValue(node, 'itunes:duration') || getTagValue(node, 'duration');
    duration = normalizeDuration(rawDuration);

    // Determine media type
    let mediaType: 'text' | 'video' | 'audio' = 'text';
    if (isVideo) mediaType = 'video';
    else if (isAudio) mediaType = 'audio';

    items.push({
      id: itemId,
      feedId: source.id,
      title: itemTitle,
      url: itemLink,
      author: author.replace(/^\s+|\s+$/g, ''),
      content: itemContent || rawSnippet, // Fallback to snippet if no content
      snippet: itemSnippet,
      timestamp,
      isRead: false,
      isStarred: false,
      mediaType,
      audioUrl,
      duration,
      transcriptionStatus: isAudio ? 'none' : undefined,
    });
  });

  return { source, items };
};

// --- Helpers ---

/**
 * Normalize duration to seconds (as string).
 * Handles multiple formats:
 * - "01:23:45" (HH:MM:SS) -> "5025"
 * - "23:45" (MM:SS) -> "1425"
 * - "5025" (already seconds) -> "5025"
 * - "1h 23m 45s" -> "5025"
 */
const normalizeDuration = (duration: string | undefined): string | undefined => {
  if (!duration) return undefined;

  const trimmed = duration.trim();

  // Already in seconds format
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  // HH:MM:SS or MM:SS format
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(p => parseInt(p, 10) || 0);
    if (parts.length === 3) {
      // HH:MM:SS
      const [hours, mins, secs] = parts;
      return String(hours * 3600 + mins * 60 + secs);
    } else if (parts.length === 2) {
      // MM:SS
      const [mins, secs] = parts;
      return String(mins * 60 + secs);
    }
  }

  // Human-readable format: "1h 23m 45s" or "1 hour 23 minutes"
  const hourMatch = trimmed.match(/(\d+)\s*h/i);
  const minMatch = trimmed.match(/(\d+)\s*m/i);
  const secMatch = trimmed.match(/(\d+)\s*s/i);

  if (hourMatch || minMatch || secMatch) {
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
    const secs = secMatch ? parseInt(secMatch[1], 10) : 0;
    return String(hours * 3600 + mins * 60 + secs);
  }

  // Return as-is if we can't parse
  return trimmed;
};

const getTagValue = (node: Element, tagName: string): string => {
  const els = node.getElementsByTagName(tagName);
  if (els.length > 0) {
      return els[0].textContent || els[0].innerHTML || '';
  }
  return '';
};

const getAtomLink = (node: Element): string => {
  const links = Array.from(node.getElementsByTagName('link'));
  const altLink = links.find(l => l.getAttribute('rel') === 'alternate' || !l.getAttribute('rel'));
  return altLink ? (altLink.getAttribute('href') || '') : '';
};

const stripHtml = (html: string) => {
   const tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   
   // Aggressively remove script and style tags to prevent "garbage" text (CSS/JS) appearing in snippets
   const scripts = tmp.querySelectorAll('script');
   const styles = tmp.querySelectorAll('style');
   const links = tmp.querySelectorAll('link');
   
   scripts.forEach(node => node.parentNode?.removeChild(node));
   styles.forEach(node => node.parentNode?.removeChild(node));
   links.forEach(node => node.parentNode?.removeChild(node));

   // Use textContent which is faster and cleaner
   let text = tmp.textContent || tmp.innerText || "";
   
   // Collapse whitespace
   return text.replace(/\s+/g, ' ').trim();
};

const generateId = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
};

const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + "00000".substring(0, 6 - c.length) + c;
};