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
