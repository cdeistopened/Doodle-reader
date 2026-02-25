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

interface SelectionResult {
  items: (FetchedItem & { sourceName: string; sourceUrl?: string })[];
  duplicateLinksSkipped: number;
  invalidLinksSkipped: number;
  sourceCapSkipped: number;
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

  // Sort by timestamp (newest first), then enforce quality defaults.
  filteredItems.sort((a, b) => b.timestamp - a.timestamp);
  const maxItemsPerDigest = normalizePositiveInt(
    stream.filters?.maxItemsPerDigest,
    getPositiveIntFromEnv("DIGEST_MAX_ITEMS_DEFAULT", 12, 20)
  );
  const maxItemsPerSource = getPositiveIntFromEnv("DIGEST_MAX_ITEMS_PER_SOURCE", 2, 8);
  const selection = selectItemsForDigest(filteredItems, maxItemsPerDigest, maxItemsPerSource);
  const selectedItems = selection.items;

  if (selectedItems.length === 0) {
    console.warn(
      `[Digest][Quality] "${stream.name}" skipped: no valid links after filtering/capping (duplicates=${selection.duplicateLinksSkipped}, invalidLinks=${selection.invalidLinksSkipped})`
    );
    return null;
  }

  // 3. SUMMARIZE — Generate AI summaries for each item
  const geminiKey = process.env.GEMINI_API_KEY;
  const digestItems: DigestItem[] = [];
  let totalTokens = 0;
  let fallbackSummaries = 0;
  let aiEmptySummaries = 0;

  for (const item of selectedItems) {
    const fallbackSummary = buildFallbackSummary(item);
    let summary = fallbackSummary;
    let usedFallback = true;

    if (geminiKey) {
      try {
        const result = await summarizeWithGemini(geminiKey, item);
        const normalized = normalizeSummaryText(result.summary);
        if (normalized) {
          summary = normalized;
          usedFallback = false;
        } else {
          aiEmptySummaries += 1;
        }
        totalTokens += result.tokensUsed;
      } catch (error: any) {
        console.warn(`[Digest] Failed to summarize "${item.title}":`, error.message);
      }
    }

    if (!hasMeaningfulSummary(summary)) {
      summary = fallbackSummary;
      usedFallback = true;
    }
    if (usedFallback) fallbackSummaries += 1;

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
      digestMarkdown = normalizeDigestMarkdown(composed.markdown || "") || undefined;
      totalTokens += composed.tokensUsed;
    } catch (error: any) {
      console.warn(`[Digest] Failed to compose digest:`, error.message);
    }
  }
  if (!digestMarkdown) {
    digestMarkdown = composeFallbackDigestMarkdown(stream.name, digestItems);
  }

  const summaryCoverage = digestItems.length > 0
    ? Math.round((digestItems.filter((item) => hasMeaningfulSummary(item.summary)).length / digestItems.length) * 100)
    : 0;
  const sourceCounts = new Map<string, number>();
  for (const item of digestItems) {
    sourceCounts.set(item.sourceName, (sourceCounts.get(item.sourceName) || 0) + 1);
  }
  const maxItemsFromSingleSource = sourceCounts.size > 0
    ? Math.max(...Array.from(sourceCounts.values()))
    : 0;

  // 5. SAVE — Persist the digest run
  const runId = await ctx.runMutation(internal.digestHelpers.saveDigestRun, {
    streamId: stream._id,
    userId: stream.userId,
    items: digestItems,
    digestMarkdown,
    itemCount: digestItems.length,
    tokensUsed: totalTokens,
  });

  const qualityWarnings: string[] = [];
  if (summaryCoverage < 90) qualityWarnings.push("summary_coverage_below_90");
  if (selection.duplicateLinksSkipped > 0) qualityWarnings.push("duplicate_links_skipped");
  if (selection.invalidLinksSkipped > 0) qualityWarnings.push("invalid_links_skipped");
  if (selection.sourceCapSkipped > 0) qualityWarnings.push("source_cap_applied");
  if (aiEmptySummaries > 0) qualityWarnings.push("empty_ai_summaries_recovered");

  console.log(
    `[Digest][Quality] ${JSON.stringify({
      runId,
      streamId: stream._id,
      streamName: stream.name,
      fetchedItems: allItems.length,
      filteredItems: filteredItems.length,
      selectedItems: selectedItems.length,
      maxItemsPerDigest,
      maxItemsPerSource,
      uniqueSources: sourceCounts.size,
      maxItemsFromSingleSource,
      duplicateLinksSkipped: selection.duplicateLinksSkipped,
      invalidLinksSkipped: selection.invalidLinksSkipped,
      sourceCapSkipped: selection.sourceCapSkipped,
      fallbackSummaries,
      aiEmptySummaries,
      summaryCoverage,
      warnings: qualityWarnings,
    })}`
  );

  // Render + store email HTML even if delivery is disabled.
  const appBaseUrl = getAppBaseUrl();
  const digestHtml = generateEmailHtml({
    stream,
    digestRunId: runId,
    items: digestItems,
    digestMarkdown,
    appBaseUrl,
  });
  await ctx.runMutation(internal.digestHelpers.setDigestHtml, {
    digestRunId: runId,
    digestHtml,
  });

  // 6. DELIVER — Send email
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && stream.deliveryEmail) {
    try {
      await sendEmail(resendKey, {
        from: getDigestFromAddress(),
        to: stream.deliveryEmail,
        subject: `${stream.name} — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
        html: digestHtml,
      });
      await ctx.runMutation(internal.digestHelpers.markEmailSent, { digestRunId: runId });
      console.log(`[Digest] Email sent for "${stream.name}" to ${stream.deliveryEmail}`);
    } catch (error: any) {
      console.error(`[Digest] Failed to send email:`, error.message);
    }
  } else if (!resendKey) {
    console.log(`[Digest] RESEND_API_KEY not set, skipping email delivery for "${stream.name}"`);
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

  const prompt = `Write a clear 2-3 sentence summary of this ${item.mediaType === 'video' ? 'video' : item.mediaType === 'audio' ? 'podcast episode' : 'article'}.

Requirements:
- Plain text only (no markdown, bullets, or labels)
- 40-80 words total
- Include one concrete detail
- End with why this is worth opening
- If source text is sparse, infer cautiously from title/context without inventing facts

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

function generateEmailHtml(options: {
  stream: any;
  digestRunId: Id<"digestRuns">;
  items: DigestItem[];
  digestMarkdown?: string;
  appBaseUrl: string;
}): string {
  const { stream, digestRunId, items, digestMarkdown, appBaseUrl } = options;

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const digestOverviewUrl = `${appBaseUrl}/digest/${digestRunId}`;
  const editorialIntro = extractEditorialIntro(digestMarkdown)
    || `Here are ${items.length} highlights from ${stream.name}.`;
  const preheader = `${items.length} curated items from ${stream.name}. Open your digest.`;

  const itemsHtml = items
    .map((item, index) => {
      const readerUrl = `${appBaseUrl}/read/${digestRunId}/${index}`;
      const originalUrl = isValidAbsoluteUrl(item.url) ? item.url : readerUrl;
      const dateLabel = item.publishedAt
        ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';
      const sourceDomain = extractDomainSafely(originalUrl);
      const summaryText = normalizeSummaryText(item.summary) || buildMinimalSummary(item.title, item.sourceName);

      return `
      <tr>
        <td style="padding: 0 0 18px;">
          <table role="presentation" style="width: 100%; border: 1px solid #E8E8E8; border-radius: 10px; background: #FFFFFF;">
            <tr>
              <td style="padding: 16px 16px 14px;">
                <div style="margin: 0 0 8px;">
                  <span style="display: inline-block; width: 22px; height: 22px; border-radius: 50%; background: #1A1A1A; color: #FFFFFF; text-align: center; line-height: 22px; font-size: 11px; font-weight: 700; margin-right: 8px;">${index + 1}</span>
                  <span style="font-size: 11px; color: #6B6B6B; text-transform: uppercase; letter-spacing: 0.7px; font-weight: 600;">
                    ${escapeHtml(item.sourceName)}${dateLabel ? ` · ${dateLabel}` : ''}
                  </span>
                </div>

                <a href="${escapeHtml(readerUrl)}" style="color: #161616; text-decoration: none; font-size: 19px; font-weight: 700; font-family: Georgia, 'Times New Roman', serif; line-height: 1.35; display: block; margin-bottom: 10px;">
                  ${escapeHtml(item.title)}
                </a>

                <p style="font-size: 15px; color: #353535; margin: 0 0 12px; line-height: 1.6; font-family: Georgia, 'Times New Roman', serif;">
                  ${escapeHtml(summaryText)}
                </p>

                <div style="font-size: 13px; line-height: 1.4;">
                  <a href="${escapeHtml(readerUrl)}" style="color: #1A6B4A; text-decoration: none; font-weight: 600;">
                    Open in reader →
                  </a>
                  <span style="color: #B8B8B8; margin: 0 8px;">|</span>
                  <a href="${escapeHtml(originalUrl)}" style="color: #666666; text-decoration: none;">
                    Original${sourceDomain ? ` (${escapeHtml(sourceDomain)})` : ''}
                  </a>
                </div>
              </td>
            </tr>
          </table>
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
<body style="margin: 0; padding: 0; background-color: #F4F1EC; font-family: Georgia, 'Times New Roman', serif;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" style="width: 100%; background-color: #F4F1EC;">
    <tr>
      <td style="padding: 20px 12px;">
        <table role="presentation" style="width: 100%; max-width: 640px; margin: 0 auto; background: #FAFAF7; border: 1px solid #E7E2DA; border-radius: 12px;">
          <tr>
            <td style="padding: 28px 20px 18px; background: linear-gradient(135deg, #171717 0%, #2C2C2C 100%); border-radius: 12px 12px 0 0;">
              <div style="font-size: 11px; color: #AFAFAF; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 7px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                DoodleDog Digest
              </div>
              <h1 style="margin: 0 0 6px; color: #FFFFFF; font-size: 28px; line-height: 1.2; font-family: Georgia, 'Times New Roman', serif;">
                ${escapeHtml(stream.name)}
              </h1>
              <div style="font-size: 13px; color: #B6B6B6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${date} · ${items.length} items
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 18px 20px 14px;">
              <p style="margin: 0; padding-left: 12px; border-left: 3px solid #1A6B4A; font-size: 16px; line-height: 1.6; color: #2F2F2F; font-style: italic;">
                ${escapeHtml(editorialIntro)}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 6px 16px 8px;">
              <table role="presentation" style="width: 100%;">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 20px 24px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(digestOverviewUrl)}" style="display: inline-block; background: #1A6B4A; color: #FFFFFF; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      Open full digest
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 20px 24px; text-align: center; font-size: 12px; color: #8B8B8B; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              Curated by DoodleDog
            </td>
          </tr>
        </table>
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
  options: { from: string; to: string; subject: string; html: string }
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: options.from,
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

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function getPositiveIntFromEnv(name: string, fallback: number, maxAllowed: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maxAllowed);
}

function selectItemsForDigest(
  items: (FetchedItem & { sourceName: string; sourceUrl?: string })[],
  maxItemsPerDigest: number,
  maxItemsPerSource: number
): SelectionResult {
  const selected: (FetchedItem & { sourceName: string; sourceUrl?: string })[] = [];
  const seenCanonicalUrls = new Set<string>();
  const sourceCounts = new Map<string, number>();

  let duplicateLinksSkipped = 0;
  let invalidLinksSkipped = 0;
  let sourceCapSkipped = 0;

  for (const item of items) {
    if (selected.length >= maxItemsPerDigest) break;

    const canonicalUrl = canonicalizeUrl(item.url);
    if (!canonicalUrl) {
      invalidLinksSkipped += 1;
      continue;
    }
    if (seenCanonicalUrls.has(canonicalUrl)) {
      duplicateLinksSkipped += 1;
      continue;
    }

    const countForSource = sourceCounts.get(item.sourceName) || 0;
    if (countForSource >= maxItemsPerSource) {
      sourceCapSkipped += 1;
      continue;
    }

    seenCanonicalUrls.add(canonicalUrl);
    sourceCounts.set(item.sourceName, countForSource + 1);
    selected.push({
      ...item,
      url: canonicalUrl,
    });
  }

  return {
    items: selected,
    duplicateLinksSkipped,
    invalidLinksSkipped,
    sourceCapSkipped,
  };
}

function canonicalizeUrl(url: string): string | null {
  if (!isValidAbsoluteUrl(url)) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("utm_term");
    parsed.searchParams.delete("utm_content");
    return parsed.toString();
  } catch {
    return null;
  }
}

function isValidAbsoluteUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function buildFallbackSummary(item: FetchedItem): string {
  const normalizedTitle = normalizeSummaryText(item.title) || "Untitled item";
  const content = normalizeSummaryText(item.content);
  if (!content) {
    return `No excerpt was available for "${normalizedTitle}". Open the source to review the full item.`;
  }

  const trimmed = content.length > 260 ? `${content.substring(0, 257)}...` : content;
  if (trimmed.length < 40) {
    return `${trimmed} Open the source for full context.`;
  }
  return trimmed;
}

function buildMinimalSummary(title: string, sourceName: string): string {
  const safeTitle = normalizeSummaryText(title) || "Untitled item";
  const safeSource = normalizeSummaryText(sourceName) || "the source";
  return `A summary was not available for "${safeTitle}". Open the source from ${safeSource} for details.`;
}

function normalizeSummaryText(text: string): string {
  if (!text) return "";
  return stripHtml(text)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDigestMarkdown(markdown: string): string {
  if (!markdown) return "";
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasMeaningfulSummary(summary: string): boolean {
  const normalized = normalizeSummaryText(summary);
  return normalized.length >= 20;
}

function composeFallbackDigestMarkdown(streamName: string, items: DigestItem[]): string {
  const heading = `# ${streamName}`;
  const intro = `Highlights from ${items.length} recent items.`;
  const body = items
    .map((item, index) => {
      const summary = normalizeSummaryText(item.summary) || buildMinimalSummary(item.title, item.sourceName);
      return `${index + 1}. **${item.title}** (${item.sourceName})\n${summary}`;
    })
    .join("\n\n");
  return `${heading}\n\n${intro}\n\n${body}`;
}

function extractEditorialIntro(markdown?: string): string {
  if (!markdown) return "";
  const firstSubstantiveLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !/^\d+\./.test(line));
  return firstSubstantiveLine ? normalizeSummaryText(firstSubstantiveLine) : "";
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function extractDomainSafely(url: string): string {
  if (!isValidAbsoluteUrl(url)) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getAppBaseUrl(): string {
  const raw = process.env.DOODLEDOG_APP_URL || process.env.APP_URL || 'https://doodlereader.com';
  return raw.replace(/\/+$/, '');
}

function getDigestFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || 'DoodleDog <onboarding@resend.dev>';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
