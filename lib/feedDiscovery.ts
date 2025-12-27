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
// STRATEGY 2: HTML Auto-Discovery
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

  // For URLs, try auto-discovery first
  if (looksLikeUrl) {
    console.log('[FeedDiscovery] Trying auto-discovery for URL...');
    const autoFeeds = await autoDiscoverFromUrl(trimmedQuery);
    addFeeds(autoFeeds);

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
 * Simple fuzzy match score (0-1, higher is better)
 */
function fuzzyScore(needle: string, haystack: string): number {
  needle = needle.toLowerCase();
  haystack = haystack.toLowerCase();

  if (haystack.includes(needle)) {
    return 1;
  }

  let score = 0;
  let needleIdx = 0;

  for (let i = 0; i < haystack.length && needleIdx < needle.length; i++) {
    if (haystack[i] === needle[needleIdx]) {
      score++;
      needleIdx++;
    }
  }

  return needleIdx === needle.length ? score / haystack.length : 0;
}

/**
 * Fuzzy search through a list of feeds
 */
export function fuzzySearchFeeds<T extends { name: string; url?: string }>(
  feeds: T[],
  query: string,
  limit = 10
): T[] {
  if (!query.trim()) {
    return feeds.slice(0, limit);
  }

  const scored = feeds.map(feed => ({
    feed,
    score: Math.max(
      fuzzyScore(query, feed.name),
      feed.url ? fuzzyScore(query, feed.url) * 0.5 : 0
    ),
  }));

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.feed);
}
