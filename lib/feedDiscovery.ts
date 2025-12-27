/**
 * Feed Discovery
 *
 * Multi-strategy feed finder:
 * 1. Try iTunes Search API (best for podcasts)
 * 2. Try Feedly API (fast, works for most popular feeds)
 * 3. Try HTML auto-discovery (parse <link rel="alternate">)
 * 4. Fallback to Gemini AI with web search (for obscure blogs)
 */

import { fetchRawContent } from './rss';

export interface DiscoveredFeed {
  url: string;
  title: string;
  description?: string;
  artworkUrl?: string;
  author?: string;
  source: 'itunes' | 'feedly' | 'autodiscover' | 'gemini' | 'podcastindex';
  isPodcast?: boolean;
}

export interface DiscoveryResult {
  feeds: DiscoveredFeed[];
  error?: string;
}

// Podcast-related keywords to detect podcast searches
const PODCAST_KEYWORDS = [
  'podcast', 'show', 'episode', 'audio', 'listen',
  'interview', 'talk', 'radio', 'cast', 'pod'
];

function looksLikePodcastSearch(query: string): boolean {
  const lower = query.toLowerCase();
  return PODCAST_KEYWORDS.some(kw => lower.includes(kw));
}

// =============================================================================
// STRATEGY 1: iTunes Search API (Best for Podcasts)
// =============================================================================

async function searchiTunes(query: string): Promise<DiscoveredFeed[]> {
  try {
    // iTunes Search API - free, no auth required
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&entity=podcast&limit=8`;

    const response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return [];
    }

    return data.results
      .filter((result: any) => result.feedUrl) // Only include results with feed URLs
      .map((result: any) => ({
        url: result.feedUrl,
        title: result.collectionName || result.trackName || 'Unknown Podcast',
        description: result.artistName ? `by ${result.artistName}` : undefined,
        artworkUrl: result.artworkUrl100 || result.artworkUrl60,
        author: result.artistName,
        source: 'itunes' as const,
        isPodcast: true,
      }));
  } catch (e) {
    console.warn('[FeedDiscovery] iTunes search failed:', e);
    return [];
  }
}

// =============================================================================
// STRATEGY 2: Podcast Index API (Backup for Podcasts)
// =============================================================================

async function searchPodcastIndex(query: string): Promise<DiscoveredFeed[]> {
  // Podcast Index requires API keys, but we can try their public search
  // For now, skip this - iTunes is usually sufficient
  // TODO: Add Podcast Index support with user-provided API keys
  return [];
}

// =============================================================================
// STRATEGY 3: Feedly Search
// =============================================================================

async function searchFeedly(query: string): Promise<DiscoveredFeed[]> {
  try {
    const searchUrl = `https://cloud.feedly.com/v3/search/feeds?query=${encodeURIComponent(query)}&count=5`;
    const jsonStr = await fetchRawContent(searchUrl);
    const data = JSON.parse(jsonStr);

    if (data.results && data.results.length > 0) {
      return data.results.slice(0, 5).map((result: any) => ({
        url: result.feedId.replace(/^feed\//, ''),
        title: result.title || 'Unknown',
        description: result.description,
        source: 'feedly' as const,
      }));
    }
  } catch (e) {
    console.warn('[FeedDiscovery] Feedly search failed:', e);
  }
  return [];
}

// =============================================================================
// STRATEGY 2: Common RSS URL Patterns (Blogs/Newsletters)
// =============================================================================

// Common feed URL patterns for popular platforms
const COMMON_FEED_PATTERNS = [
  // WordPress
  '/feed',
  '/feed/',
  '/rss',
  '/rss/',
  '/feed/rss/',
  '/feed/atom/',
  '/?feed=rss2',
  // Ghost
  '/rss/',
  // Substack
  '/feed',
  // Medium
  '/feed',
  // Generic
  '/atom.xml',
  '/feed.xml',
  '/rss.xml',
  '/index.xml',
  '/blog/feed',
  '/blog/rss',
];

// Platform-specific URL transformations
function getPlatformFeedUrl(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = parsed.hostname.toLowerCase();

    // Substack: username.substack.com -> username.substack.com/feed
    if (hostname.endsWith('.substack.com')) {
      return `https://${hostname}/feed`;
    }

    // Medium: medium.com/@user or user.medium.com
    if (hostname === 'medium.com' || hostname.endsWith('.medium.com')) {
      // Medium feeds are at /feed
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}/feed`;
    }

    // Ghost blogs often have /rss/
    // WordPress.com blogs
    if (hostname.endsWith('.wordpress.com')) {
      return `https://${hostname}/feed/`;
    }

    // Beehiiv newsletters
    if (hostname.endsWith('.beehiiv.com')) {
      return `https://${hostname}/feed`;
    }

    // Buttondown newsletters
    if (hostname.endsWith('.buttondown.email')) {
      return `https://${hostname}/rss`;
    }

    return null;
  } catch {
    return null;
  }
}

async function tryCommonFeedPatterns(url: string): Promise<DiscoveredFeed[]> {
  try {
    const baseUrl = url.startsWith('http') ? url : `https://${url}`;
    const origin = new URL(baseUrl).origin;

    // First, try platform-specific URL
    const platformUrl = getPlatformFeedUrl(url);
    if (platformUrl) {
      try {
        const content = await fetchRawContent(platformUrl);
        if (content.includes('<rss') || content.includes('<feed') || content.includes('<channel')) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, 'text/xml');
          const title = xmlDoc.querySelector('title')?.textContent || 'Feed';
          return [{
            url: platformUrl,
            title,
            source: 'autodiscover' as const,
          }];
        }
      } catch {
        // Continue to try other patterns
      }
    }

    // Try common patterns
    for (const pattern of COMMON_FEED_PATTERNS.slice(0, 5)) { // Only try first 5 to avoid too many requests
      const feedUrl = origin + pattern;
      try {
        const content = await fetchRawContent(feedUrl);
        // Quick check for RSS/Atom markers
        if (content.includes('<rss') || content.includes('<feed') || content.includes('<channel')) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, 'text/xml');
          const title = xmlDoc.querySelector('title')?.textContent || 'Feed';
          return [{
            url: feedUrl,
            title,
            source: 'autodiscover' as const,
          }];
        }
      } catch {
        // Continue to next pattern
      }
    }
  } catch (e) {
    console.warn('[FeedDiscovery] Pattern matching failed:', e);
  }
  return [];
}

// =============================================================================
// STRATEGY 3: HTML Auto-Discovery
// =============================================================================

async function autoDiscoverFromUrl(url: string): Promise<DiscoveredFeed[]> {
  try {
    // Normalize URL
    let targetUrl = url;
    if (!url.startsWith('http')) {
      targetUrl = `https://${url}`;
    }

    const content = await fetchRawContent(targetUrl);
    const parser = new DOMParser();

    // Check if it's already a valid feed
    const xmlDoc = parser.parseFromString(content, 'text/xml');
    const isRss = xmlDoc.getElementsByTagName('rss').length > 0;
    const isAtom = xmlDoc.getElementsByTagName('feed').length > 0;

    if (isRss || isAtom) {
      const title = xmlDoc.querySelector('title')?.textContent || 'Feed';
      return [{
        url: targetUrl,
        title,
        source: 'autodiscover' as const,
      }];
    }

    // Parse as HTML and look for feed links
    const htmlDoc = parser.parseFromString(content, 'text/html');
    const feedLinks = Array.from(htmlDoc.querySelectorAll('link[rel="alternate"]'))
      .filter(link => {
        const type = link.getAttribute('type');
        return type && (type.includes('rss') || type.includes('atom') || type.includes('xml'));
      });

    const feeds: DiscoveredFeed[] = [];
    for (const link of feedLinks.slice(0, 3)) {
      let href = link.getAttribute('href');
      if (!href) continue;

      // Handle relative URLs
      if (!href.startsWith('http')) {
        try {
          href = new URL(href, targetUrl).href;
        } catch {
          const origin = new URL(targetUrl).origin;
          href = origin + (href.startsWith('/') ? '' : '/') + href;
        }
      }

      feeds.push({
        url: href,
        title: link.getAttribute('title') || 'Feed',
        source: 'autodiscover' as const,
      });
    }

    return feeds;
  } catch (e) {
    console.warn('[FeedDiscovery] Auto-discovery failed:', e);
  }
  return [];
}

// =============================================================================
// STRATEGY 3: Gemini AI Search
// =============================================================================

function getGeminiApiKey(): string | null {
  // @ts-ignore - Vite env
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('gemini_api_key');
  }
  return null;
}

async function searchWithGemini(query: string): Promise<DiscoveredFeed[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('[FeedDiscovery] No Gemini API key for AI search');
    return [];
  }

  try {
    const prompt = `Find the RSS feed URL for: "${query}"

Search the web and return the most likely RSS/Atom feed URL for this blog, website, or publication.

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "url": "https://example.com/feed.xml",
  "title": "Blog Name",
  "description": "Brief description"
}

If you cannot find a feed, return:
{"error": "Could not find feed"}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
          },
          tools: [{
            googleSearch: {}
          }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return [];
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const result = JSON.parse(jsonStr);

    if (result.error || !result.url) {
      return [];
    }

    return [{
      url: result.url,
      title: result.title || 'Found Feed',
      description: result.description,
      source: 'gemini' as const,
    }];
  } catch (e) {
    console.warn('[FeedDiscovery] Gemini search failed:', e);
  }
  return [];
}

// =============================================================================
// MAIN DISCOVERY FUNCTION
// =============================================================================

/**
 * Discover RSS feeds for a given query.
 * Tries multiple strategies in order of reliability/speed.
 * Prioritizes podcast directories for podcast-like searches.
 */
export async function discoverFeeds(query: string): Promise<DiscoveryResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { feeds: [], error: 'Please enter a search term or URL' };
  }

  const allFeeds: DiscoveredFeed[] = [];
  const seenUrls = new Set<string>();

  const addFeeds = (feeds: DiscoveredFeed[]) => {
    for (const feed of feeds) {
      // Normalize URL for deduplication
      const normalizedUrl = feed.url.replace(/\/$/, '').toLowerCase();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        allFeeds.push(feed);
      }
    }
  };

  // Check if it looks like a URL
  const looksLikeUrl = trimmedQuery.includes('.') && !trimmedQuery.includes(' ');
  const isPodcastSearch = looksLikePodcastSearch(trimmedQuery);

  // For URLs, try multiple discovery methods
  if (looksLikeUrl) {
    // First, try HTML auto-discovery (looks for <link rel="alternate">)
    console.log('[FeedDiscovery] Trying auto-discovery for URL...');
    const autoFeeds = await autoDiscoverFromUrl(trimmedQuery);
    addFeeds(autoFeeds);

    if (allFeeds.length > 0) {
      return { feeds: allFeeds };
    }

    // If auto-discovery fails, try common feed URL patterns
    // This works well for Substack, Medium, WordPress, Ghost, etc.
    console.log('[FeedDiscovery] Trying common feed patterns...');
    const patternFeeds = await tryCommonFeedPatterns(trimmedQuery);
    addFeeds(patternFeeds);

    if (allFeeds.length > 0) {
      return { feeds: allFeeds };
    }
  }

  // For podcast searches or general queries, try iTunes first
  // iTunes is more reliable for podcasts than Feedly
  console.log('[FeedDiscovery] Trying iTunes podcast search...');
  const itunesFeeds = await searchiTunes(trimmedQuery);
  addFeeds(itunesFeeds);

  // If this looks like a podcast search and we found results, prioritize them
  if (isPodcastSearch && allFeeds.length > 0) {
    console.log(`[FeedDiscovery] Found ${allFeeds.length} podcasts via iTunes`);
    return { feeds: allFeeds };
  }

  // Also try Feedly for blogs/news (run in parallel with iTunes for non-podcast searches)
  if (!isPodcastSearch || allFeeds.length === 0) {
    console.log('[FeedDiscovery] Trying Feedly search...');
    const feedlyFeeds = await searchFeedly(trimmedQuery);
    addFeeds(feedlyFeeds);
  }

  if (allFeeds.length > 0) {
    return { feeds: allFeeds };
  }

  // Fallback: Try Gemini AI search
  console.log('[FeedDiscovery] Trying Gemini AI search...');
  const geminiFeeds = await searchWithGemini(trimmedQuery);
  addFeeds(geminiFeeds);

  if (allFeeds.length === 0) {
    return { feeds: [], error: `No feeds found for "${trimmedQuery}". Try searching by podcast name or pasting the RSS URL directly.` };
  }

  return { feeds: allFeeds };
}

/**
 * Search specifically for podcasts
 */
export async function discoverPodcasts(query: string): Promise<DiscoveryResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { feeds: [], error: 'Please enter a podcast name' };
  }

  // Try iTunes first (best podcast directory)
  const itunesFeeds = await searchiTunes(trimmedQuery);
  if (itunesFeeds.length > 0) {
    return { feeds: itunesFeeds };
  }

  // Fallback to Feedly
  const feedlyFeeds = await searchFeedly(trimmedQuery + ' podcast');
  if (feedlyFeeds.length > 0) {
    return { feeds: feedlyFeeds };
  }

  return { feeds: [], error: `No podcasts found for "${trimmedQuery}"` };
}

// =============================================================================
// FUZZY SEARCH FOR EXISTING FEEDS
// =============================================================================

/**
 * Normalize text for comparison
 * - Lowercase
 * - Remove common words (the, a, an)
 * - Remove special characters
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove special chars
    .replace(/\b(the|a|an|and|or|of|to|in|for|on|with)\b/g, '') // Remove stop words
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split text into words for word-based matching
 */
function getWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(w => w.length > 1);
}

/**
 * Calculate fuzzy match score (0-1, higher is better)
 * Uses multiple strategies:
 * 1. Exact substring match (highest score)
 * 2. Word-based matching (good for multi-word queries)
 * 3. Prefix matching (good for partial words)
 * 4. Character sequence matching (fallback)
 */
function fuzzyScore(needle: string, haystack: string): number {
  const normalNeedle = normalizeText(needle);
  const normalHaystack = normalizeText(haystack);

  // Exact substring match - highest score
  if (normalHaystack.includes(normalNeedle)) {
    // Boost if it's at the start
    if (normalHaystack.startsWith(normalNeedle)) {
      return 1.0;
    }
    return 0.95;
  }

  const needleWords = getWords(needle);
  const haystackWords = getWords(haystack);

  if (needleWords.length === 0) return 0;

  // Word-based matching
  let wordMatches = 0;
  let prefixMatches = 0;

  for (const nw of needleWords) {
    // Check for exact word match
    if (haystackWords.includes(nw)) {
      wordMatches++;
      continue;
    }

    // Check for prefix match (user typing partial word)
    const prefixMatch = haystackWords.some(hw => hw.startsWith(nw) || nw.startsWith(hw));
    if (prefixMatch) {
      prefixMatches++;
    }
  }

  // Calculate word-based score
  const wordScore = (wordMatches + prefixMatches * 0.7) / needleWords.length;
  if (wordScore > 0.3) {
    return Math.min(wordScore * 0.9, 0.9); // Cap at 0.9 to keep below exact match
  }

  // Fallback: Character sequence matching
  let score = 0;
  let needleIdx = 0;
  let lastMatchIdx = -1;

  for (let i = 0; i < normalHaystack.length && needleIdx < normalNeedle.length; i++) {
    if (normalHaystack[i] === normalNeedle[needleIdx]) {
      score++;
      // Bonus for consecutive matches
      if (lastMatchIdx === i - 1) {
        score += 0.5;
      }
      lastMatchIdx = i;
      needleIdx++;
    }
  }

  // Only return a score if we matched all characters
  if (needleIdx === normalNeedle.length) {
    return Math.min((score / (normalNeedle.length + normalHaystack.length)) * 2, 0.8);
  }

  return 0;
}

/**
 * Fuzzy search through a list of feeds
 * Matches against name, url, and extracts domain for additional matching
 */
export function fuzzySearchFeeds<T extends { name: string; url?: string }>(
  feeds: T[],
  query: string,
  limit = 10
): T[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return feeds.slice(0, limit);
  }

  const scored = feeds.map(feed => {
    // Score against feed name
    const nameScore = fuzzyScore(trimmedQuery, feed.name);

    // Score against URL (extract domain for cleaner matching)
    let urlScore = 0;
    if (feed.url) {
      try {
        const domain = new URL(feed.url).hostname.replace(/^www\./, '');
        urlScore = fuzzyScore(trimmedQuery, domain) * 0.7;
      } catch {
        urlScore = fuzzyScore(trimmedQuery, feed.url) * 0.5;
      }
    }

    return {
      feed,
      score: Math.max(nameScore, urlScore),
    };
  });

  return scored
    .filter(s => s.score > 0.1) // Slightly higher threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.feed);
}
