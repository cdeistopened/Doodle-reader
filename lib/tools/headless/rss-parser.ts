/**
 * Server-safe RSS/Atom Parser
 *
 * Uses fast-xml-parser instead of browser DOMParser.
 * Designed to run in Convex Node.js actions and other server environments.
 * Produces the same output shape as lib/rss.ts fetchFeed().
 */

import { XMLParser } from 'fast-xml-parser';

// =============================================================================
// TYPES (mirrors FeedItem/FeedSource from browser code)
// =============================================================================

export interface ParsedFeedSource {
  id: string;
  url: string;
  siteUrl: string;
  name: string;
  icon: string;
  color: string;
  isPodcast: boolean;
}

export interface ParsedFeedItem {
  id: string;
  feedId: string;
  title: string;
  url: string;
  author: string;
  content: string;
  snippet: string;
  timestamp: number;
  mediaType: 'text' | 'video' | 'audio';
  audioUrl?: string;
  duration?: string;
  publishedAt?: string;
}

export interface ParsedFeed {
  source: ParsedFeedSource;
  items: ParsedFeedItem[];
  totalCount: number;
}

// =============================================================================
// PARSER
// =============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Parse CDATA sections
  cdataPropName: '__cdata',
  // Don't trim whitespace from text values
  trimValues: true,
  // Parse tag values as strings (don't convert numbers)
  parseTagValue: false,
});

/**
 * Fetch and parse an RSS/Atom feed from a URL.
 * Server-safe — no DOM APIs used.
 */
export async function fetchFeedHeadless(
  feedUrl: string,
  options: { limit?: number; timeout?: number } = {}
): Promise<ParsedFeed> {
  const limit = options.limit ?? 100;
  const timeout = options.timeout ?? 15000;

  // Fetch the raw XML
  const response = await fetch(feedUrl, {
    signal: AbortSignal.timeout(timeout),
    headers: {
      'User-Agent': 'DoodleDog/1.0 (feed reader)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: HTTP ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return parseFeedXml(xml, feedUrl);
}

/**
 * Parse RSS/Atom XML content (without fetching).
 * Useful when you already have the XML string.
 */
export function parseFeedXml(xml: string, feedUrl: string): ParsedFeed {
  const parsed = xmlParser.parse(xml);

  // Detect feed type
  if (parsed.rss) {
    return parseRSS(parsed.rss, feedUrl);
  } else if (parsed.feed) {
    return parseAtom(parsed.feed, feedUrl);
  } else if (parsed['rdf:RDF']) {
    return parseRDF(parsed['rdf:RDF'], feedUrl);
  }

  throw new Error('Unrecognized feed format — expected RSS, Atom, or RDF');
}

// =============================================================================
// RSS 2.0 PARSER
// =============================================================================

function parseRSS(rss: any, feedUrl: string): ParsedFeed {
  const channel = rss.channel || {};
  const title = textOf(channel.title) || 'Unknown Feed';
  const description = textOf(channel.description) || textOf(channel['itunes:summary']) || '';
  const siteUrl = textOf(channel.link) || '';
  const author = textOf(channel['itunes:author']) || textOf(channel.managingEditor) || '';

  const isPodcast = !!channel['itunes:author'] ||
    (Array.isArray(channel.item) && channel.item.some((i: any) => i.enclosure));

  const domain = extractDomain(siteUrl || feedUrl);
  const feedId = generateId(feedUrl);

  const source: ParsedFeedSource = {
    id: feedId,
    url: feedUrl,
    siteUrl,
    name: title,
    icon: `https://www.google.com/s2/favicons?domain=${domain}`,
    color: stringToColor(title),
    isPodcast,
  };

  const rawItems = ensureArray(channel.item);
  const items = rawItems.map((item: any) => parseRSSItem(item, source));
  items.sort((a, b) => b.timestamp - a.timestamp);

  return {
    source,
    items: items.slice(0, 100), // Always cap at 100 for parsing
    totalCount: items.length,
  };
}

function parseRSSItem(item: any, source: ParsedFeedSource): ParsedFeedItem {
  const title = textOf(item.title) || '(No Title)';
  const link = textOf(item.link) || '';
  const content = textOf(item['content:encoded']) ||
    textOf(item.description) ||
    textOf(item['itunes:summary']) || '';
  const rawSnippet = textOf(item.description) ||
    textOf(item['itunes:subtitle']) ||
    textOf(item['itunes:summary']) || '';
  const snippet = stripHtml(rawSnippet).substring(0, 160).trim();
  const author = textOf(item['dc:creator']) || textOf(item.author) || source.name;

  const dateStr = textOf(item.pubDate) || textOf(item['dc:date']);
  const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();
  const publishedAt = dateStr || undefined;

  // Audio detection
  let audioUrl: string | undefined;
  let mediaType: 'text' | 'video' | 'audio' = 'text';

  if (item.enclosure) {
    const enc = item.enclosure;
    const encType = enc['@_type'] || '';
    const encUrl = enc['@_url'] || '';
    if (encType.includes('audio') || /\.(mp3|m4a|wav|ogg|aac)(\?|$)/i.test(encUrl)) {
      audioUrl = encUrl;
      mediaType = 'audio';
    }
  }

  // Video detection
  if (link.includes('youtube.com') || link.includes('youtu.be')) {
    mediaType = 'video';
  }

  // Duration
  const rawDuration = textOf(item['itunes:duration']);
  const duration = normalizeDuration(rawDuration);

  const itemId = generateId(link || (title + timestamp));

  return {
    id: itemId,
    feedId: source.id,
    title,
    url: link,
    author,
    content,
    snippet,
    timestamp,
    mediaType,
    audioUrl,
    duration,
    publishedAt,
  };
}

// =============================================================================
// ATOM PARSER
// =============================================================================

function parseAtom(feed: any, feedUrl: string): ParsedFeed {
  const title = textOf(feed.title) || 'Unknown Feed';
  const subtitle = textOf(feed.subtitle) || '';

  // Atom links can be objects or arrays
  const links = ensureArray(feed.link);
  const altLink = links.find((l: any) =>
    l['@_rel'] === 'alternate' || !l['@_rel']
  );
  const siteUrl = altLink?.['@_href'] || '';

  const authorName = textOf(feed.author?.name) || '';
  const domain = extractDomain(siteUrl || feedUrl);
  const feedId = generateId(feedUrl);

  const source: ParsedFeedSource = {
    id: feedId,
    url: feedUrl,
    siteUrl,
    name: title,
    icon: `https://www.google.com/s2/favicons?domain=${domain}`,
    color: stringToColor(title),
    isPodcast: false,
  };

  const rawEntries = ensureArray(feed.entry);
  const items = rawEntries.map((entry: any) => parseAtomEntry(entry, source));
  items.sort((a, b) => b.timestamp - a.timestamp);

  return {
    source,
    items: items.slice(0, 100),
    totalCount: items.length,
  };
}

function parseAtomEntry(entry: any, source: ParsedFeedSource): ParsedFeedItem {
  const title = textOf(entry.title) || '(No Title)';

  const links = ensureArray(entry.link);
  const altLink = links.find((l: any) =>
    l['@_rel'] === 'alternate' || !l['@_rel']
  );
  const url = altLink?.['@_href'] || '';

  const content = textOf(entry.content) || textOf(entry.summary) || '';
  const snippet = stripHtml(textOf(entry.summary) || content).substring(0, 160).trim();
  const author = textOf(entry.author?.name) || source.name;

  const dateStr = textOf(entry.updated) || textOf(entry.published);
  const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();

  const mediaType: 'text' | 'video' | 'audio' =
    url.includes('youtube.com') || url.includes('youtu.be') ? 'video' : 'text';

  const itemId = generateId(url || (title + timestamp));

  return {
    id: itemId,
    feedId: source.id,
    title,
    url,
    author,
    content,
    snippet,
    timestamp,
    mediaType,
    publishedAt: dateStr || undefined,
  };
}

// =============================================================================
// RDF (RSS 1.0) PARSER
// =============================================================================

function parseRDF(rdf: any, feedUrl: string): ParsedFeed {
  const channel = rdf.channel || {};
  const title = textOf(channel.title) || 'Unknown Feed';
  const siteUrl = textOf(channel.link) || '';
  const domain = extractDomain(siteUrl || feedUrl);
  const feedId = generateId(feedUrl);

  const source: ParsedFeedSource = {
    id: feedId,
    url: feedUrl,
    siteUrl,
    name: title,
    icon: `https://www.google.com/s2/favicons?domain=${domain}`,
    color: stringToColor(title),
    isPodcast: false,
  };

  const rawItems = ensureArray(rdf.item);
  const items = rawItems.map((item: any) => {
    const itemTitle = textOf(item.title) || '(No Title)';
    const link = textOf(item.link) || '';
    const content = textOf(item.description) || textOf(item['content:encoded']) || '';
    const snippet = stripHtml(content).substring(0, 160).trim();
    const dateStr = textOf(item['dc:date']);
    const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();

    return {
      id: generateId(link || (itemTitle + timestamp)),
      feedId: source.id,
      title: itemTitle,
      url: link,
      author: textOf(item['dc:creator']) || source.name,
      content,
      snippet,
      timestamp,
      mediaType: 'text' as const,
      publishedAt: dateStr || undefined,
    };
  });

  items.sort((a, b) => b.timestamp - a.timestamp);

  return {
    source,
    items: items.slice(0, 100),
    totalCount: items.length,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract text from a parsed XML node value.
 * Handles: string, object with #text, object with __cdata, etc.
 */
function textOf(value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value.__cdata) return value.__cdata;
  if (value['#text']) return String(value['#text']);
  if (typeof value === 'object') {
    // Some parsers wrap text in an object
    return String(value['#text'] || value.__cdata || '');
  }
  return '';
}

/** Ensure a value is an array (handles single-item feeds) */
function ensureArray(val: any): any[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

/** Strip HTML tags from text (server-safe, no DOM) */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract domain from URL */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Simple hash-based ID generator (matches browser version) */
function generateId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/** Generate a deterministic color from a string */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

/** Normalize duration to seconds string */
function normalizeDuration(duration: string | undefined): string | undefined {
  if (!duration) return undefined;
  const trimmed = duration.trim();

  // Already seconds
  if (/^\d+$/.test(trimmed)) return trimmed;

  // HH:MM:SS or MM:SS
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(p => parseInt(p, 10) || 0);
    if (parts.length === 3) return String(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    if (parts.length === 2) return String(parts[0] * 60 + parts[1]);
  }

  // Human-readable: "1h 23m 45s"
  const h = trimmed.match(/(\d+)\s*h/i);
  const m = trimmed.match(/(\d+)\s*m/i);
  const s = trimmed.match(/(\d+)\s*s/i);
  if (h || m || s) {
    return String(
      (h ? parseInt(h[1], 10) : 0) * 3600 +
      (m ? parseInt(m[1], 10) : 0) * 60 +
      (s ? parseInt(s[1], 10) : 0)
    );
  }

  return trimmed;
}
