/**
 * Digest Engine — Queries & Mutations
 *
 * These run in the default Convex runtime (not Node.js).
 * The Node.js actions in digests.ts call these via internal references.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// =============================================================================
// INTERNAL QUERIES
// =============================================================================

/**
 * Get all active streams that are due for processing
 */
export const getStreamsToProcess = internalQuery({
  args: {},
  handler: async (ctx) => {
    const streams = await ctx.db
      .query("streams")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const now = Date.now();
    return streams.filter((stream) => {
      if (!stream.lastRun) return true; // Never run, always due

      const elapsed = now - stream.lastRun;
      const ONE_HOUR = 3600_000;
      const ONE_DAY = 86400_000;

      switch (stream.schedule) {
        case "twice_daily":
          return elapsed >= 12 * ONE_HOUR;
        case "daily":
          return elapsed >= ONE_DAY;
        case "weekly":
          return elapsed >= 7 * ONE_DAY;
        default:
          return elapsed >= ONE_DAY;
      }
    });
  },
});

/**
 * Get a stream by ID (internal, no auth check)
 */
export const getStreamById = internalQuery({
  args: { id: v.id("streams") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// =============================================================================
// INTERNAL MUTATIONS
// =============================================================================

/**
 * Save a completed digest run
 */
export const saveDigestRun = internalMutation({
  args: {
    streamId: v.id("streams"),
    userId: v.string(),
    items: v.array(v.object({
      title: v.string(),
      url: v.string(),
      sourceName: v.string(),
      sourceUrl: v.optional(v.string()),
      summary: v.string(),
      publishedAt: v.optional(v.string()),
      contentType: v.union(
        v.literal("article"),
        v.literal("video"),
        v.literal("podcast"),
        v.literal("newsletter")
      ),
      fullContent: v.optional(v.string()),
    })),
    digestMarkdown: v.optional(v.string()),
    digestHtml: v.optional(v.string()),
    itemCount: v.number(),
    tokensUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const runId = await ctx.db.insert("digestRuns", {
      streamId: args.streamId,
      userId: args.userId,
      items: args.items,
      digestMarkdown: args.digestMarkdown,
      digestHtml: args.digestHtml,
      itemCount: args.itemCount,
      generatedAt: now,
      tokensUsed: args.tokensUsed,
    });

    // Update stream lastRun
    await ctx.db.patch(args.streamId, {
      lastRun: now,
      updated: now,
    });

    return runId;
  },
});

/**
 * Mark an email as sent on a digest run
 */
export const markEmailSent = internalMutation({
  args: {
    digestRunId: v.id("digestRuns"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.digestRunId, {
      emailSentAt: Date.now(),
    });
  },
});

/**
 * Create a stream from an OPML category (used by opml.ts import action)
 */
export const createStreamFromCategory = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    sources: v.array(v.object({
      type: v.union(
        v.literal("rss"),
        v.literal("youtube_channel"),
        v.literal("google_alert"),
        v.literal("newsletter")
      ),
      url: v.string(),
      name: v.optional(v.string()),
    })),
    schedule: v.union(v.literal("daily"), v.literal("twice_daily"), v.literal("weekly")),
    deliveryEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("streams", {
      userId: args.userId,
      name: args.name,
      sources: args.sources,
      schedule: args.schedule,
      deliveryEmail: args.deliveryEmail,
      isActive: true,
      created: now,
      updated: now,
    });
  },
});
