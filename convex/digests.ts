/**
 * DoodleDog Digest Engine
 *
 * The core pipeline: fetch new content from stream sources,
 * summarize via Gemini, compose editorial digest, deliver via email.
 *
 * Uses "use node" for access to fast-xml-parser and external APIs.
 */
"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { XMLParser } from "fast-xml-parser";

// =============================================================================
// TYPES
// =============================================================================

interface DigestItem {
  title: string;
  url: string;
  sourceName: string;
  sourceUrl?: string;
  summary: string;
  publishedAt?: string;
  contentType: "article" | "video" | "podcast" | "newsletter";
  fullContent?: string;
}

interface FetchedItem {
  title: string;
  url: string;
  content: string;
  publishedAt?: string;
  timestamp: number;
  mediaType: "text" | "video" | "audio";
}

// Queries and mutations are in digestHelpers.ts (Convex requires
// queries/mutations to be in non-Node.js files).

// =============================================================================
// DIGEST PIPELINE (Node.js action)
// =============================================================================

/**
 * Process all active streams that are due.
 * Called by the cron job.
 */
export const processActiveStreams = internalAction({
  args: {},
  handler: async (ctx) => {
    const streams = await ctx.runQuery(internal.digestHelpers.getStreamsToProcess);

    console.log(`[Digest] Found ${streams.length} streams to process`);

    for (const stream of streams) {
      try {
        await processStream(ctx, stream);
      } catch (error: any) {
        console.error(`[Digest] Failed to process stream "${stream.name}":`, error.message);
      }
    }
  },
});

/**
 * Manually trigger a single stream's digest (for testing).
 */
export const runStreamNow = action({
  args: { streamId: v.id("streams") },
  handler: async (ctx, args) => {
    const stream = await ctx.runQuery(internal.digestHelpers.getStreamById, {
      id: args.streamId,
    });
    if (!stream) throw new Error("Stream not found");

    return await processStream(ctx, stream);
  },
});


// =============================================================================
// CORE PIPELINE
// =============================================================================

async function processStream(ctx: any, stream: any): Promise<Id<"digestRuns"> | null> {
  console.log(`[Digest] Processing stream: "${stream.name}" (${stream.sources.length} sources)`);

  // 1. COLLECT — Fetch new items from all sources
  const allItems: (FetchedItem & { sourceName: string; sourceUrl?: string })[] = [];

  for (const source of stream.sources) {
    try {
      const items = await fetchSourceItems(source, stream.lastRun);
      allItems.push(
        ...items.map((item) => ({
          ...item,
          sourceName: source.name || extractDomain(source.url),
          sourceUrl: source.url,
        }))
      );
    } catch (error: any) {
      console.warn(`[Digest] Failed to fetch source "${source.name || source.url}":`, error.message);
    }
  }

  console.log(`[Digest] Collected ${allItems.length} new items`);

  if (allItems.length === 0) {
    console.log(`[Digest] No new items for "${stream.name}", skipping`);
    return null;
  }

  // 2. FILTER — Apply keyword filters
  let filteredItems = allItems;
  if (stream.filters) {
    filteredItems = applyFilters(allItems, stream.filters);
    console.log(`[Digest] After filtering: ${filteredItems.length} items`);
  }

  // Sort by timestamp (newest first)
  filteredItems.sort((a, b) => b.timestamp - a.timestamp);

  // Cap items
  const maxItems = stream.filters?.maxItemsPerDigest || 20;
  const cappedItems = filteredItems.slice(0, maxItems);

  // 3. SUMMARIZE — Generate AI summaries for each item
  const geminiKey = process.env.GEMINI_API_KEY;
  const digestItems: DigestItem[] = [];
  let totalTokens = 0;

  for (const item of cappedItems) {
    let summary = item.content.substring(0, 200) + '...'; // Fallback

    if (geminiKey) {
      try {
        const result = await summarizeWithGemini(geminiKey, item);
        summary = result.summary;
        totalTokens += result.tokensUsed;
      } catch (error: any) {
        console.warn(`[Digest] Failed to summarize "${item.title}":`, error.message);
      }
    }

    const contentType = item.mediaType === 'video' ? 'video' as const
      : item.mediaType === 'audio' ? 'podcast' as const
      : 'article' as const;

    digestItems.push({
      title: item.title,
      url: item.url,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      summary,
      publishedAt: item.publishedAt,
      contentType,
      fullContent: item.content,
    });
  }

  // 4. COMPOSE — Generate editorial digest
  let digestMarkdown: string | undefined;
  if (geminiKey && digestItems.length > 0) {
    try {
      const composed = await composeDigest(geminiKey, stream, digestItems);
      digestMarkdown = composed.markdown;
      totalTokens += composed.tokensUsed;
    } catch (error: any) {
      console.warn(`[Digest] Failed to compose digest:`, error.message);
    }
  }

  // 5. SAVE — Persist the digest run
  const runId = await ctx.runMutation(internal.digestHelpers.saveDigestRun, {
    streamId: stream._id,
    userId: stream.userId,
    items: digestItems,
    digestMarkdown,
    itemCount: digestItems.length,
    tokensUsed: totalTokens,
  });

  // 6. DELIVER — Send email
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && stream.deliveryEmail) {
    try {
      const html = generateEmailHtml(stream, digestItems, digestMarkdown);
      await sendEmail(resendKey, {
        to: stream.deliveryEmail,
        subject: `${stream.name} — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
        html,
      });
      await ctx.runMutation(internal.digestHelpers.markEmailSent, { digestRunId: runId });
      console.log(`[Digest] Email sent for "${stream.name}" to ${stream.deliveryEmail}`);
    } catch (error: any) {
      console.error(`[Digest] Failed to send email:`, error.message);
    }
  }

  console.log(`[Digest] Completed "${stream.name}": ${digestItems.length} items, ${totalTokens} tokens`);
  return runId;
}

// =============================================================================
// SOURCE FETCHING
// =============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '__cdata',
  trimValues: true,
  parseTagValue: false,
});

async function fetchSourceItems(
  source: { type: string; url: string; name?: string },
  lastRun?: number | null
): Promise<FetchedItem[]> {
  const cutoff = lastRun || (Date.now() - 86400_000); // Default: last 24 hours

  switch (source.type) {
    case 'rss':
    case 'newsletter':
      return await fetchRSSItems(source.url, cutoff);
    case 'youtube_channel':
      return await fetchYouTubeChannelItems(source.url, cutoff);
    case 'google_alert':
      return await fetchRSSItems(source.url, cutoff); // Google Alerts provide RSS
    default:
      console.warn(`[Digest] Unknown source type: ${source.type}`);
      return [];
  }
}

async function fetchRSSItems(feedUrl: string, cutoff: number): Promise<FetchedItem[]> {
  const response = await fetch(feedUrl, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': 'DoodleDog/1.0 (feed reader)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${feedUrl}`);
  }

  const xml = await response.text();
  const parsed = xmlParser.parse(xml);

  const items: FetchedItem[] = [];

  // RSS 2.0
  if (parsed.rss?.channel?.item) {
    const rawItems = ensureArray(parsed.rss.channel.item);
    for (const item of rawItems) {
      const dateStr = textOf(item.pubDate) || textOf(item['dc:date']);
      const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();
      if (timestamp < cutoff) continue; // Skip old items

      const link = textOf(item.link) || '';
      const isVideo = link.includes('youtube.com') || link.includes('youtu.be');
      const enclosure = item.enclosure;
      const isAudio = enclosure && (
        (enclosure['@_type'] || '').includes('audio') ||
        /\.(mp3|m4a|wav|ogg|aac)(\?|$)/i.test(enclosure['@_url'] || '')
      );

      items.push({
        title: textOf(item.title) || '(No Title)',
        url: link,
        content: stripHtml(textOf(item['content:encoded']) || textOf(item.description) || ''),
        publishedAt: dateStr,
        timestamp,
        mediaType: isVideo ? 'video' : isAudio ? 'audio' : 'text',
      });
    }
  }

  // Atom
  if (parsed.feed?.entry) {
    const rawEntries = ensureArray(parsed.feed.entry);
    for (const entry of rawEntries) {
      const dateStr = textOf(entry.updated) || textOf(entry.published);
      const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();
      if (timestamp < cutoff) continue;

      const links = ensureArray(entry.link);
      const altLink = links.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
      const url = altLink?.['@_href'] || '';

      items.push({
        title: textOf(entry.title) || '(No Title)',
        url,
        content: stripHtml(textOf(entry.content) || textOf(entry.summary) || ''),
        publishedAt: dateStr,
        timestamp,
        mediaType: url.includes('youtube.com') ? 'video' : 'text',
      });
    }
  }

  return items;
}

async function fetchYouTubeChannelItems(channelUrl: string, cutoff: number): Promise<FetchedItem[]> {
  // Convert channel URL to RSS feed URL
  let rssUrl = channelUrl;

  // Handle various YouTube URL formats
  const channelIdMatch = channelUrl.match(/channel\/(UC[\w-]+)/);
  const handleMatch = channelUrl.match(/@([\w-]+)/);

  if (channelIdMatch) {
    rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
  } else if (handleMatch) {
    // For handles, we need to resolve to channel ID — for now use the RSS feed directly
    rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelUrl}`;
    // TODO: Resolve handle to channel ID via YouTube Data API
  } else if (channelUrl.includes('youtube.com/feeds/videos.xml')) {
    rssUrl = channelUrl; // Already an RSS URL
  }

  return await fetchRSSItems(rssUrl, cutoff);
}

// =============================================================================
// FILTERING
// =============================================================================

function applyFilters(
  items: (FetchedItem & { sourceName: string; sourceUrl?: string })[],
  filters: { keywords?: string[]; excludeKeywords?: string[]; maxItemsPerDigest?: number }
): typeof items {
  let filtered = items;

  if (filters.keywords && filters.keywords.length > 0) {
    const keywords = filters.keywords.map((k) => k.toLowerCase());
    filtered = filtered.filter((item) => {
      const text = (item.title + ' ' + item.content).toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });
  }

  if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
    const excludeKeywords = filters.excludeKeywords.map((k) => k.toLowerCase());
    filtered = filtered.filter((item) => {
      const text = (item.title + ' ' + item.content).toLowerCase();
      return !excludeKeywords.some((kw) => text.includes(kw));
    });
  }

  return filtered;
}

// =============================================================================
// AI SUMMARIZATION
// =============================================================================

async function summarizeWithGemini(
  apiKey: string,
  item: FetchedItem
): Promise<{ summary: string; tokensUsed: number }> {
  // Truncate content to avoid token limits
  const content = item.content.substring(0, 4000);

  const prompt = `Summarize this ${item.mediaType === 'video' ? 'video' : item.mediaType === 'audio' ? 'podcast episode' : 'article'} in 2-3 concise sentences. Focus on what's new or interesting.

Title: ${item.title}

Content:
${content}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API ${response.status}`);
  }

  const data = await response.json();
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokensUsed = (data.usageMetadata?.promptTokenCount || 0) +
    (data.usageMetadata?.candidatesTokenCount || 0);

  return { summary, tokensUsed };
}

async function composeDigest(
  apiKey: string,
  stream: any,
  items: DigestItem[]
): Promise<{ markdown: string; tokensUsed: number }> {
  const itemSummaries = items
    .map((item, i) => `${i + 1}. **${item.title}** (${item.sourceName})\n   ${item.summary}`)
    .join('\n\n');

  const styleInstruction = stream.format?.customPrompt ||
    'Write as a knowledgeable friend sharing interesting finds. Be concise but add brief editorial transitions between items.';

  const prompt = `You are composing a digest called "${stream.name}".

${styleInstruction}

Here are today's items:

${itemSummaries}

Compose a short, readable digest that:
- Opens with a 1-sentence editorial overview of today's highlights
- Presents each item with its summary (keep the titles and sources)
- Adds brief transitional phrases between items where natural
- Closes with a one-liner

Output in Markdown format. Keep it scannable — someone should read this in 3-5 minutes.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API ${response.status}`);
  }

  const data = await response.json();
  const markdown = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokensUsed = (data.usageMetadata?.promptTokenCount || 0) +
    (data.usageMetadata?.candidatesTokenCount || 0);

  return { markdown, tokensUsed };
}

// =============================================================================
// EMAIL GENERATION
// =============================================================================

function generateEmailHtml(
  stream: any,
  items: DigestItem[],
  digestMarkdown?: string
): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const itemsHtml = items
    .map((item) => {
      const typeEmoji = item.contentType === 'video' ? '📺'
        : item.contentType === 'podcast' ? '🎙️'
        : item.contentType === 'newsletter' ? '📰'
        : '📄';

      return `
      <tr>
        <td style="padding: 16px 0; border-bottom: 1px solid #EBEBEB;">
          <div style="font-size: 11px; color: #777; margin-bottom: 4px;">
            ${typeEmoji} ${item.sourceName}${item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
          </div>
          <a href="${item.url}" style="color: #2200CC; text-decoration: none; font-size: 16px; font-weight: 600; font-family: Georgia, 'Times New Roman', serif; line-height: 1.3;">
            ${escapeHtml(item.title)}
          </a>
          <div style="font-size: 14px; color: #333; margin-top: 6px; line-height: 1.5; font-family: Georgia, 'Times New Roman', serif;">
            ${escapeHtml(item.summary)}
          </div>
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(stream.name)} — ${date}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F9FF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #FFFFFF;">
    <!-- Header -->
    <tr>
      <td style="padding: 32px 24px 16px; border-bottom: 3px solid #2200CC;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a; font-family: Georgia, 'Times New Roman', serif;">
          ${escapeHtml(stream.name)}
        </h1>
        <div style="font-size: 13px; color: #777; margin-top: 4px;">
          ${date} · ${items.length} items
        </div>
      </td>
    </tr>

    ${digestMarkdown ? `
    <!-- Editorial Overview -->
    <tr>
      <td style="padding: 20px 24px; background-color: #FAFAFA; border-bottom: 1px solid #EBEBEB;">
        <div style="font-size: 14px; color: #444; line-height: 1.6; font-family: Georgia, 'Times New Roman', serif; font-style: italic;">
          ${escapeHtml(digestMarkdown.split('\n')[0] || '')}
        </div>
      </td>
    </tr>
    ` : ''}

    <!-- Items -->
    <tr>
      <td style="padding: 0 24px;">
        <table role="presentation" style="width: 100%;">
          ${itemsHtml}
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 24px; text-align: center; border-top: 1px solid #EBEBEB;">
        <div style="font-size: 12px; color: #999;">
          Curated by DoodleDog · <a href="#" style="color: #999;">Manage streams</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// =============================================================================
// EMAIL SENDING
// =============================================================================

async function sendEmail(
  resendKey: string,
  options: { to: string; subject: string; html: string }
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'DoodleDog <digest@doodlereader.com>',
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Resend API error: ${err.message || response.status}`);
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function textOf(value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value?.__cdata) return value.__cdata;
  if (value?.['#text']) return String(value['#text']);
  return '';
}

function ensureArray(val: any): any[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
