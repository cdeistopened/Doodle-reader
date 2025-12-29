/**
 * Storage Statistics Query
 */

import { query } from "./_generated/server";

/**
 * Get storage statistics for the current user
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        totalDocuments: 0,
        byType: { article: 0, transcript: 0, scan: 0, video: 0, note: 0 },
        bySource: { rss: 0, podcast: 0, youtube: 0, scan: 0, manual: 0, newsletter: 0 },
        totalFeeds: 0,
        totalUnread: 0,
        totalStarred: 0,
      };
    }

    const userId = identity.subject;

    // Get all documents
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get all feeds
    const feeds = await ctx.db
      .query("feeds")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Calculate stats
    const byType = { article: 0, transcript: 0, scan: 0, video: 0, note: 0 };
    const bySource = { rss: 0, podcast: 0, youtube: 0, scan: 0, manual: 0, newsletter: 0 };
    let totalUnread = 0;
    let totalStarred = 0;

    for (const doc of documents) {
      byType[doc.type]++;
      bySource[doc.source]++;

      if (doc.article) {
        if (!doc.article.isRead) totalUnread++;
        if (doc.article.isStarred) totalStarred++;
      }
    }

    return {
      totalDocuments: documents.length,
      byType,
      bySource,
      totalFeeds: feeds.length,
      totalUnread,
      totalStarred,
    };
  },
});

/**
 * Get all unique tags with counts
 */
/**
 * Analyze storage usage - estimates size of documents
 * Run this to see what's eating bandwidth
 */
export const storageAnalysis = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { error: "Not authenticated" };

    const userId = identity.subject;

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Estimate size of each document
    const docSizes = documents.map((doc) => {
      const json = JSON.stringify(doc);
      const sizeKB = json.length / 1024;

      // Break down content vs assets
      const contentSize = (doc.content?.length || 0) / 1024;
      const rawSize = (doc.assets?.raw?.content?.length || 0) / 1024;
      const polishedSize = (doc.assets?.polished?.content?.length || 0) / 1024;
      const summarySize = (JSON.stringify(doc.assets?.summaries || []).length) / 1024;

      return {
        id: doc._id,
        title: doc.title.slice(0, 50),
        type: doc.type,
        source: doc.source,
        totalKB: Math.round(sizeKB),
        contentKB: Math.round(contentSize),
        rawKB: Math.round(rawSize),
        polishedKB: Math.round(polishedSize),
        summaryKB: Math.round(summarySize),
      };
    });

    // Sort by size descending
    docSizes.sort((a, b) => b.totalKB - a.totalKB);

    // Aggregate by type
    const byType: Record<string, { count: number; totalKB: number }> = {};
    for (const doc of docSizes) {
      if (!byType[doc.type]) byType[doc.type] = { count: 0, totalKB: 0 };
      byType[doc.type].count++;
      byType[doc.type].totalKB += doc.totalKB;
    }

    const totalKB = docSizes.reduce((sum, d) => sum + d.totalKB, 0);

    return {
      totalDocuments: documents.length,
      totalSizeMB: Math.round(totalKB / 1024 * 10) / 10,
      byType,
      topTenLargest: docSizes.slice(0, 10),
      duplicationWarning: docSizes.filter(d => d.rawKB > 0 && d.contentKB > 0).length,
    };
  },
});

export const tags = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const tagCounts = new Map<string, { count: number; lastUsed: string }>();

    for (const doc of documents) {
      for (const tag of doc.tags) {
        const existing = tagCounts.get(tag);
        if (existing) {
          existing.count++;
          if (doc.modified > existing.lastUsed) {
            existing.lastUsed = doc.modified;
          }
        } else {
          tagCounts.set(tag, { count: 1, lastUsed: doc.modified });
        }
      }
    }

    return Array.from(tagCounts.entries()).map(([tag, data]) => ({
      tag,
      count: data.count,
      lastUsed: data.lastUsed,
    }));
  },
});
