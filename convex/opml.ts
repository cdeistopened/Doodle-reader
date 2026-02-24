/**
 * OPML Import (DoodleDog Digest Engine)
 *
 * Parses OPML files (e.g., Feedly export) and creates streams
 * from the category structure. Each OPML category becomes a stream,
 * with feeds auto-classified by URL pattern.
 *
 * Uses "use node" for XML parsing via fast-xml-parser.
 */
"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { XMLParser } from "fast-xml-parser";

// =============================================================================
// TYPES
// =============================================================================

interface OPMLSource {
  type: "rss" | "youtube_channel" | "google_alert" | "newsletter";
  url: string;
  name: string;
}

interface OPMLCategory {
  name: string;
  sources: OPMLSource[];
}

// =============================================================================
// OPML PARSER
// =============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
});

/**
 * Classify a feed URL into a source type.
 */
function classifySource(xmlUrl: string, text: string): OPMLSource["type"] {
  // YouTube RSS feeds
  if (xmlUrl.includes('youtube.com/feeds/videos.xml')) {
    return 'youtube_channel';
  }

  // Google News/Alerts RSS
  if (xmlUrl.includes('news.google.com') && xmlUrl.includes('rss')) {
    return 'google_alert';
  }

  // Newsletter proxies
  if (
    xmlUrl.includes('kill-the-newsletter.com') ||
    xmlUrl.includes('feedly.com/email/') ||
    xmlUrl.includes('feedly.com/web/')
  ) {
    return 'newsletter';
  }

  return 'rss';
}

/**
 * Parse OPML XML into categories with classified sources.
 */
function parseOPML(xml: string): OPMLCategory[] {
  const parsed = xmlParser.parse(xml);
  const body = parsed?.opml?.body;
  if (!body) throw new Error('Invalid OPML: missing <body>');

  const outlines = ensureArray(body.outline);
  const categories: OPMLCategory[] = [];

  for (const outline of outlines) {
    // Category = outline with children (nested outlines)
    const children = ensureArray(outline.outline);
    if (children.length > 0) {
      const categoryName = outline['@_text'] || outline['@_title'] || 'Unnamed';
      const sources: OPMLSource[] = children.map((child: any) => {
        const url = child['@_xmlUrl'] || '';
        const name = child['@_text'] || child['@_title'] || '';
        return {
          type: classifySource(url, name),
          url,
          name,
        };
      }).filter((s: OPMLSource) => s.url); // Skip entries without URLs

      if (sources.length > 0) {
        categories.push({ name: categoryName, sources });
      }
    } else if (outline['@_xmlUrl']) {
      // Top-level feed (not in a category) → put in "Uncategorized"
      const url = outline['@_xmlUrl'] || '';
      const name = outline['@_text'] || outline['@_title'] || '';
      let uncategorized = categories.find((c) => c.name === 'Uncategorized');
      if (!uncategorized) {
        uncategorized = { name: 'Uncategorized', sources: [] };
        categories.push(uncategorized);
      }
      uncategorized.sources.push({
        type: classifySource(url, name),
        url,
        name,
      });
    }
  }

  return categories;
}

function ensureArray(val: any): any[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// createStreamFromCategory mutation is in digestHelpers.ts
// (Convex requires mutations to be in non-Node.js files).

// =============================================================================
// PUBLIC ACTION — Import OPML
// =============================================================================

/**
 * Import an OPML file to create streams.
 * Each category in the OPML becomes a stream.
 *
 * Returns a summary of what was created.
 */
export const importOPML = action({
  args: {
    opmlXml: v.string(),
    deliveryEmail: v.string(),
    schedule: v.optional(v.union(v.literal("daily"), v.literal("twice_daily"), v.literal("weekly"))),
    // Optional: only import specific categories (by name)
    categoryFilter: v.optional(v.array(v.string())),
    // If true, do a dry run — parse and return results without creating streams
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const schedule = args.schedule || "daily";
    const categories = parseOPML(args.opmlXml);

    // Apply category filter if provided
    let filtered = categories;
    if (args.categoryFilter && args.categoryFilter.length > 0) {
      const filterSet = new Set(args.categoryFilter.map((c) => c.toLowerCase()));
      filtered = categories.filter((c) => filterSet.has(c.name.toLowerCase()));
    }

    // Summary for dry run or result
    const summary = filtered.map((cat) => {
      const byType = { rss: 0, youtube_channel: 0, newsletter: 0, google_alert: 0 };
      for (const s of cat.sources) byType[s.type]++;
      return {
        name: cat.name,
        totalSources: cat.sources.length,
        rss: byType.rss,
        youtube: byType.youtube_channel,
        newsletter: byType.newsletter,
        googleAlert: byType.google_alert,
        sources: cat.sources.map((s) => ({ name: s.name, type: s.type, url: s.url })),
      };
    });

    if (args.dryRun) {
      return {
        dryRun: true,
        categories: summary,
        totalCategories: summary.length,
        totalSources: summary.reduce((sum, c) => sum + c.totalSources, 0),
      };
    }

    // Create streams
    const createdStreams: { name: string; id: string; sourceCount: number }[] = [];

    for (const cat of filtered) {
      const id = await ctx.runMutation(internal.digestHelpers.createStreamFromCategory, {
        userId: identity.subject,
        name: cat.name,
        sources: cat.sources,
        schedule,
        deliveryEmail: args.deliveryEmail,
      });

      createdStreams.push({
        name: cat.name,
        id: id as string,
        sourceCount: cat.sources.length,
      });
    }

    return {
      dryRun: false,
      created: createdStreams,
      totalStreams: createdStreams.length,
      totalSources: createdStreams.reduce((sum, s) => sum + s.sourceCount, 0),
    };
  },
});

/**
 * Preview OPML contents without importing.
 * Useful for showing the user what categories/feeds are available.
 */
export const previewOPML = action({
  args: {
    opmlXml: v.string(),
  },
  handler: async (_ctx, args) => {
    const categories = parseOPML(args.opmlXml);

    return categories.map((cat) => {
      const byType = { rss: 0, youtube_channel: 0, newsletter: 0, google_alert: 0 };
      for (const s of cat.sources) byType[s.type]++;
      return {
        name: cat.name,
        totalSources: cat.sources.length,
        rss: byType.rss,
        youtube: byType.youtube_channel,
        newsletter: byType.newsletter,
        googleAlert: byType.google_alert,
        sources: cat.sources.map((s) => ({ name: s.name, type: s.type })),
      };
    });
  },
});
