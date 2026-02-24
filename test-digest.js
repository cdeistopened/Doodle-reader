#!/usr/bin/env node
/**
 * Local Digest Test Script
 *
 * Runs the digest pipeline locally — no Convex, no Clerk, no deployment needed.
 * Fetches RSS feeds, summarizes via Gemini (optional), outputs a digest.
 *
 * Usage:
 *   node test-digest.js                    # Run with default test feeds
 *   node test-digest.js --stream ai        # Run the AI/Marketing stream
 *   node test-digest.js --stream homeschool # Run the Homeschool stream
 *   node test-digest.js --stream blogs     # Run the Blogs stream
 *   GEMINI_API_KEY=xxx node test-digest.js # With AI summaries
 */

import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// CONFIG
// =============================================================================

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const STREAM_ARG = process.argv.find(a => a.startsWith('--stream='))?.split('=')[1]
  || (process.argv.includes('--stream') ? process.argv[process.argv.indexOf('--stream') + 1] : 'tier1');

// Real streams built from actual OPML categories
const TEST_STREAMS = {
  tier1: {
    name: 'Tier 1 — Must Read',
    feeds: [
      { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
      { name: 'Daring Fireball', url: 'https://daringfireball.net/feeds/main' },
      { name: 'Overreacted', url: 'https://overreacted.io/rss.xml' },
      { name: 'Pam Barnhill', url: 'https://pambarnhill.com/feed/' },
      { name: 'Michael B. Horn', url: 'https://michaelbhorn.substack.com/feed' },
      { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
      { name: 'Stratechery', url: 'https://stratechery.com/feed/' },
      { name: 'Construction Physics', url: 'https://www.construction-physics.com/feed' },
      { name: 'Dwarkesh Patel', url: 'https://www.dwarkeshpatel.com/feed' },
    ],
  },
  ai: {
    name: 'AI & Tech',
    feeds: [
      { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
      { name: 'Gary Marcus', url: 'https://garymarcus.substack.com/feed' },
      { name: 'AI Valley', url: 'https://aivalley.substack.com/feed' },
      { name: 'Wonder Tools', url: 'https://wondertools.substack.com/feed/' },
      { name: 'Every.to', url: 'https://every.to/feeds/31c4fde787510b6a818a.xml' },
      { name: 'Experimental History', url: 'https://www.experimental-history.com/feed' },
      { name: 'Overreacted', url: 'https://overreacted.io/rss.xml' },
      { name: 'Xe Iaso', url: 'https://xeiaso.net/blog.rss' },
      { name: 'Mitchell Hashimoto', url: 'https://mitchellh.com/feed.xml' },
      { name: 'Works on My Machine', url: 'https://worksonmymachine.substack.com/feed' },
      { name: 'Anil Dash', url: 'https://anildash.com/feed.xml' },
      { name: 'Geoffrey Litt', url: 'https://www.geoffreylitt.com/feed.xml' },
    ],
  },
  homeschool: {
    name: 'Homeschool & Education',
    feeds: [
      { name: 'Pam Barnhill', url: 'https://pambarnhill.com/feed/' },
      { name: 'The 74 Million', url: 'https://the74million.org/feed' },
      { name: 'EdSurge', url: 'https://www.edsurge.com/articles_rss' },
      { name: 'Michael B. Horn', url: 'https://michaelbhorn.substack.com/feed' },
      { name: 'Let Grow', url: 'https://letgrow.org/feed/' },
      { name: 'EdChoice', url: 'https://www.edchoice.org/feed/' },
      { name: 'Getting Smart', url: 'https://www.gettingsmart.com/feed/' },
      { name: 'Simply Charlotte Mason', url: 'http://simplycharlottemason.com/feed/' },
      { name: 'Simple Homeschool', url: 'http://feeds.feedburner.com/simplehomeschool' },
      { name: 'NHERI', url: 'https://nheri.org/feed/' },
      { name: 'Christy-Faith', url: 'https://christy-faith.com/feed/' },
      { name: 'Fab Fridays', url: 'https://newsletter.afabrega.com/feed/' },
      { name: 'Peter Gray', url: 'https://petergray.substack.com/feed' },
      { name: 'Kerry McDonald', url: 'https://www.forbes.com/sites/kerrymcdonald/feed/' },
      { name: 'Ed3 World', url: 'https://ed3world.substack.com/feed' },
      { name: 'Austin Scholar', url: 'https://austinscholar.substack.com/feed' },
      { name: 'Rick Hess (AEI)', url: 'https://www.aei.org/profile/frederick-m-hess/feed/' },
      { name: 'Days With Grey', url: 'https://dayswithgrey.com/feed/' },
      { name: 'r/homeschool', url: 'https://www.reddit.com/r/homeschool/.rss' },
    ],
  },
  blogs: {
    name: 'Tech Blogs',
    feeds: [
      { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
      { name: 'Troy Hunt', url: 'https://www.troyhunt.com/rss/' },
      { name: 'Construction Physics', url: 'https://www.construction-physics.com/feed' },
      { name: 'Dynomight', url: 'https://dynomight.net/feed.xml' },
      { name: 'Steve Blank', url: 'https://steveblank.com/feed/' },
      { name: 'Daring Fireball', url: 'https://daringfireball.net/feeds/main' },
      { name: 'Pluralistic', url: 'https://pluralistic.net/feed/' },
      { name: 'Rachel by the Bay', url: 'https://rachelbythebay.com/w/atom.xml' },
      { name: 'Antirez', url: 'http://antirez.com/rss' },
      { name: 'Jeff Geerling', url: 'https://www.jeffgeerling.com/blog.xml' },
      { name: 'Old New Thing', url: 'https://devblogs.microsoft.com/oldnewthing/feed' },
      { name: 'computer.rip', url: 'https://computer.rip/rss.xml' },
      { name: 'Tedium', url: 'https://feed.tedium.co/' },
      { name: 'Where\'s Your Ed At', url: 'https://www.wheresyoured.at/rss/' },
      { name: 'Joan Westenberg', url: 'https://joanwestenberg.com/rss' },
    ],
  },
  charlie: {
    name: 'Charlie\'s Stream',
    feeds: [
      { name: 'Pirate Wires', url: 'https://solana.substack.com/feed/' },
      { name: 'Palladium', url: 'https://www.palladiummag.com/feed/' },
      { name: 'Luke Burgis', url: 'https://read.lukeburgis.com/feed/' },
      { name: 'Gray Mirror', url: 'https://graymirror.substack.com/feed/' },
      { name: 'Outsider Theory', url: 'https://outsidertheory.com/feed/' },
      { name: 'Haidut', url: 'http://haidut.me/?feed=rss2' },
      { name: 'Cyberdisciple', url: 'http://cyberdisciple.wordpress.com/feed/' },
      { name: 'Ron Unz', url: 'https://www.unz.com/author/ron-unz/feed/' },
      { name: 'Getting Stronger', url: 'http://gettingstronger.org/tag/intermittent-fasting/feed/' },
    ],
  },
};

// =============================================================================
// XML PARSER
// =============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '__cdata',
  trimValues: true,
  parseTagValue: false,
});

// =============================================================================
// FEED FETCHING
// =============================================================================

async function fetchFeed(feedUrl, feedName) {
  try {
    const response = await fetch(feedUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'DoodleDog/1.0 (feed reader)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      console.log(`  ⚠ ${feedName}: HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const parsed = xmlParser.parse(xml);
    const items = [];

    // RSS 2.0
    if (parsed.rss?.channel?.item) {
      const rawItems = ensureArray(parsed.rss.channel.item);
      for (const item of rawItems.slice(0, 3)) { // Max 3 per feed
        const dateStr = textOf(item.pubDate) || textOf(item['dc:date']);
        const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();
        items.push({
          title: textOf(item.title) || '(No Title)',
          url: textOf(item.link) || '',
          content: stripHtml(textOf(item['content:encoded']) || textOf(item.description) || ''),
          publishedAt: dateStr,
          timestamp,
          sourceName: feedName,
        });
      }
    }

    // Atom
    if (parsed.feed?.entry) {
      const rawEntries = ensureArray(parsed.feed.entry);
      for (const entry of rawEntries.slice(0, 3)) {
        const dateStr = textOf(entry.updated) || textOf(entry.published);
        const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();
        const links = ensureArray(entry.link);
        const altLink = links.find(l => l['@_rel'] === 'alternate' || !l['@_rel']);
        items.push({
          title: textOf(entry.title) || '(No Title)',
          url: altLink?.['@_href'] || '',
          content: stripHtml(textOf(entry.content) || textOf(entry.summary) || ''),
          publishedAt: dateStr,
          timestamp,
          sourceName: feedName,
        });
      }
    }

    console.log(`  ✓ ${feedName}: ${items.length} items`);
    return items;
  } catch (err) {
    console.log(`  ✗ ${feedName}: ${err.message}`);
    return [];
  }
}

// =============================================================================
// GEMINI SUMMARIZATION
// =============================================================================

async function summarizeItem(item) {
  if (!GEMINI_KEY) return item.content.substring(0, 200).trim() + '...';

  const content = item.content.substring(0, 3000);
  const prompt = `Summarize this article in 2-3 concise sentences. Focus on what's new or interesting.\n\nTitle: ${item.title}\n\nContent:\n${content}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
        }),
      }
    );

    if (!response.ok) return item.content.substring(0, 200).trim() + '...';

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || item.content.substring(0, 200).trim() + '...';
  } catch {
    return item.content.substring(0, 200).trim() + '...';
  }
}

// =============================================================================
// DIGEST COMPOSITION
// =============================================================================

async function composeDigestMarkdown(streamName, items) {
  if (!GEMINI_KEY || items.length === 0) return null;

  const itemSummaries = items
    .map((item, i) => `${i + 1}. **${item.title}** (${item.sourceName})\n   ${item.summary}`)
    .join('\n\n');

  const prompt = `You are composing a digest called "${streamName}".

Write as a knowledgeable friend sharing interesting finds. Be concise but add brief editorial transitions between items.

Here are today's items:

${itemSummaries}

Compose a short, readable digest that:
- Opens with a 1-sentence editorial overview of today's highlights
- Presents each item with its summary (keep the titles and sources)
- Adds brief transitional phrases between items where natural
- Closes with a one-liner

Output in Markdown format. Keep it scannable — someone should read this in 3-5 minutes.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}

function mdToHtml(md) {
  // Convert markdown bold/italic to HTML
  return md
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:13px;">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#1a6b4a;">$1</a>')
    .replace(/\n\n/g, '</p><p style="margin:0 0 12px;line-height:1.6;">')
    .replace(/\n/g, '<br>');
}

function generateEmailHtml(streamName, items, digestMarkdown) {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  // Group items by source
  const sourceGroups = {};
  for (const item of items) {
    if (!sourceGroups[item.sourceName]) sourceGroups[item.sourceName] = [];
    sourceGroups[item.sourceName].push(item);
  }

  const itemsHtml = items.map((item, i) => {
    const dateStr = item.publishedAt
      ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';
    const domain = item.url ? (() => { try { return new URL(item.url).hostname.replace('www.',''); } catch { return ''; } })() : '';
    const summaryHtml = mdToHtml(escapeHtml(item.summary));
    const num = i + 1;

    return `
    <tr>
      <td style="padding: 0;">
        <table role="presentation" style="width: 100%; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px 24px; background: #FFFFFF; border: 1px solid #E8E8E8; border-radius: 8px;">
              <!-- Number + Source -->
              <div style="margin-bottom: 10px;">
                <span style="display: inline-block; background: #1a1a1a; color: #fff; font-size: 11px; font-weight: 700; width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; margin-right: 8px; vertical-align: middle;">${num}</span>
                <span style="font-size: 12px; color: #888; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600; vertical-align: middle;">${escapeHtml(item.sourceName)}</span>
                ${dateStr ? `<span style="font-size: 12px; color: #bbb; vertical-align: middle;"> · ${dateStr}</span>` : ''}
              </div>
              <!-- Title -->
              <a href="${escapeHtml(item.url)}" style="color: #1a1a1a; text-decoration: none; font-size: 19px; font-weight: 700; font-family: Georgia, 'Times New Roman', serif; line-height: 1.35; display: block; margin-bottom: 10px;">
                ${escapeHtml(item.title)}
              </a>
              <!-- Summary -->
              <p style="font-size: 15px; color: #444; margin: 0 0 12px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${summaryHtml}
              </p>
              <!-- Read link -->
              <a href="${escapeHtml(item.url)}" style="font-size: 13px; color: #1a6b4a; text-decoration: none; font-weight: 600; letter-spacing: 0.3px;">
                Read &rarr;${domain ? ` <span style="font-weight: 400; color: #999;">${domain}</span>` : ''}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  // Editorial intro from composed digest — grab just the opening paragraph
  let editorialHtml = '';
  if (digestMarkdown) {
    // Get the first substantive paragraph (skip the # heading)
    const lines = digestMarkdown.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const intro = lines[0] || '';
    if (intro) {
      editorialHtml = `
    <tr>
      <td style="padding: 28px 24px 20px;">
        <p style="font-size: 16px; color: #333; line-height: 1.65; margin: 0; font-family: Georgia, 'Times New Roman', serif; font-style: italic; border-left: 3px solid #1a6b4a; padding-left: 16px;">
          ${mdToHtml(escapeHtml(intro))}
        </p>
      </td>
    </tr>`;
    }
  }

  // Source summary line
  const sourceNames = [...new Set(items.map(i => i.sourceName))];
  const sourceLine = sourceNames.length <= 3
    ? sourceNames.join(', ')
    : `${sourceNames.slice(0, 3).join(', ')} + ${sourceNames.length - 3} more`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(streamName)} — ${date}</title>
  <!--[if !mso]><!-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,700;1,400&display=swap');
    body { font-family: Spectral, Georgia, 'Times New Roman', serif; }
  </style>
  <!--<![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f1ec; font-family: Georgia, 'Times New Roman', serif; -webkit-font-smoothing: antialiased;">
  <!-- Outer wrapper -->
  <table role="presentation" style="width: 100%; background-color: #f4f1ec;">
    <tr>
      <td style="padding: 24px 16px;">
        <!-- Inner card -->
        <table role="presentation" style="width: 100%; max-width: 620px; margin: 0 auto; background-color: #FAFAF7; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding: 36px 24px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);">
              <div style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">DoodleDog Digest</div>
              <h1 style="margin: 0 0 6px; font-size: 28px; font-weight: 700; color: #FFFFFF; font-family: Georgia, 'Times New Roman', serif; line-height: 1.2;">
                ${escapeHtml(streamName)}
              </h1>
              <div style="font-size: 14px; color: #999; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                ${date}
              </div>
              <div style="font-size: 13px; color: #666; margin-top: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                ${items.length} items from ${sourceLine}
              </div>
            </td>
          </tr>

          ${editorialHtml}

          <!-- Items -->
          <tr>
            <td style="padding: 8px 16px 16px;">
              <table role="presentation" style="width: 100%;">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 24px 28px; text-align: center; border-top: 1px solid #E8E8E8;">
              <div style="font-size: 13px; color: #999; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                Curated by <strong style="color: #666;">DoodleDog</strong> · Your personal digest
              </div>
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
// HELPERS
// =============================================================================

function textOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value?.__cdata) return value.__cdata;
  if (value?.['#text']) return String(value['#text']);
  return '';
}

function ensureArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function stripHtml(html) {
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

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const stream = TEST_STREAMS[STREAM_ARG];
  if (!stream) {
    console.log(`Unknown stream: "${STREAM_ARG}"`);
    console.log(`Available: ${Object.keys(TEST_STREAMS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🐕 DoodleDog Digest — ${stream.name}`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`Gemini: ${GEMINI_KEY ? 'enabled' : 'disabled (set GEMINI_API_KEY for AI summaries)'}`);
  console.log(`\nFetching ${stream.feeds.length} feeds...\n`);

  // 1. Fetch all feeds
  const allItems = [];
  for (const feed of stream.feeds) {
    const items = await fetchFeed(feed.url, feed.name);
    allItems.push(...items);
  }

  // Cap at 2 items per source so no single feed dominates
  const MAX_PER_SOURCE = 2;
  const sourceCounts = {};
  const balancedItems = allItems
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter(item => {
      sourceCounts[item.sourceName] = (sourceCounts[item.sourceName] || 0) + 1;
      return sourceCounts[item.sourceName] <= MAX_PER_SOURCE;
    });

  // Then take the top 12
  const topItems = balancedItems.slice(0, 12);

  console.log(`\nTotal: ${allItems.length} items fetched, showing top ${topItems.length}\n`);

  if (topItems.length === 0) {
    console.log('No items found. Feeds may be down or empty.');
    return;
  }

  // 2. Summarize each item
  console.log('Summarizing...\n');
  for (const item of topItems) {
    item.summary = await summarizeItem(item);
  }

  // 3. Compose editorial digest
  const digestMarkdown = await composeDigestMarkdown(stream.name, topItems);

  // 4. Output markdown digest
  console.log(`${'═'.repeat(50)}`);
  if (digestMarkdown) {
    console.log(digestMarkdown);
  } else {
    console.log(`# ${stream.name}\n`);
    console.log(`*${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${topItems.length} items*\n`);
    for (const item of topItems) {
      const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      console.log(`### ${item.title}`);
      console.log(`*${item.sourceName}${date ? ` · ${date}` : ''}*\n`);
      console.log(`${item.summary}\n`);
      console.log(`[Read more →](${item.url})\n`);
      console.log('---\n');
    }
  }

  // 5. Save HTML email version
  const html = generateEmailHtml(stream.name, topItems, digestMarkdown);
  const outputDir = path.join(__dirname, 'digest-output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const dateStr = new Date().toISOString().split('T')[0];
  const htmlPath = path.join(outputDir, `${STREAM_ARG}-${dateStr}.html`);
  const mdPath = path.join(outputDir, `${STREAM_ARG}-${dateStr}.md`);

  fs.writeFileSync(htmlPath, html);

  // Save markdown too
  const mdContent = digestMarkdown || topItems.map(item => {
    const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    return `### ${item.title}\n*${item.sourceName}${date ? ` · ${date}` : ''}*\n\n${item.summary}\n\n[Read more →](${item.url})\n\n---`;
  }).join('\n\n');
  fs.writeFileSync(mdPath, `# ${stream.name}\n\n${mdContent}\n`);

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📄 Markdown saved: ${mdPath}`);
  console.log(`📧 Email HTML saved: ${htmlPath}`);
  console.log(`\nOpen the HTML file in your browser to preview the email digest.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
