/**
 * Stream Management (DoodleDog Digest Engine)
 *
 * Streams are user-configured clusters of feeds/sources that get
 * monitored on a schedule and delivered as curated digests.
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// =============================================================================
// REUSABLE VALIDATORS
// =============================================================================

const sourceValidator = v.object({
  type: v.union(
    v.literal("rss"),
    v.literal("youtube_channel"),
    v.literal("google_alert"),
    v.literal("newsletter")
  ),
  url: v.string(),
  name: v.optional(v.string()),
});

const filtersValidator = v.optional(v.object({
  keywords: v.optional(v.array(v.string())),
  excludeKeywords: v.optional(v.array(v.string())),
  maxItemsPerDigest: v.optional(v.number()),
}));

const formatValidator = v.optional(v.object({
  style: v.optional(v.union(
    v.literal("newsletter"),
    v.literal("briefing"),
    v.literal("raw")
  )),
  includeFullContent: v.optional(v.boolean()),
  customPrompt: v.optional(v.string()),
}));

const scheduleValidator = v.union(
  v.literal("daily"),
  v.literal("twice_daily"),
  v.literal("weekly")
);

// =============================================================================
// QUERIES
// =============================================================================

/**
 * List all streams for the current user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("streams")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

/**
 * Get a single stream by ID
 */
export const get = query({
  args: { id: v.id("streams") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const stream = await ctx.db.get(args.id);
    if (!stream || stream.userId !== identity.subject) return null;

    return stream;
  },
});

/**
 * List active streams (for the digest cron job)
 */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("streams")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new stream
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    sources: v.array(sourceValidator),
    filters: filtersValidator,
    format: formatValidator,
    schedule: scheduleValidator,
    deliveryEmail: v.string(),
    deliveryTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const now = Date.now();
    const id = await ctx.db.insert("streams", {
      userId: identity.subject,
      name: args.name,
      description: args.description,
      sources: args.sources,
      filters: args.filters,
      format: args.format,
      schedule: args.schedule,
      deliveryEmail: args.deliveryEmail,
      deliveryTime: args.deliveryTime,
      isActive: true,
      created: now,
      updated: now,
    });

    return id;
  },
});

/**
 * Update a stream
 */
export const update = mutation({
  args: {
    id: v.id("streams"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    sources: v.optional(v.array(sourceValidator)),
    filters: filtersValidator,
    format: formatValidator,
    schedule: v.optional(scheduleValidator),
    deliveryEmail: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const stream = await ctx.db.get(args.id);
    if (!stream || stream.userId !== identity.subject) {
      throw new Error("Stream not found");
    }

    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.id, {
      ...filtered,
      updated: Date.now(),
    });

    return args.id;
  },
});

/**
 * Delete a stream and its digest history
 */
export const remove = mutation({
  args: {
    id: v.id("streams"),
    deleteHistory: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const stream = await ctx.db.get(args.id);
    if (!stream || stream.userId !== identity.subject) {
      throw new Error("Stream not found");
    }

    // Delete digest history if requested
    if (args.deleteHistory) {
      const runs = await ctx.db
        .query("digestRuns")
        .withIndex("by_stream", (q) => q.eq("streamId", args.id))
        .collect();

      for (const run of runs) {
        await ctx.db.delete(run._id);
      }
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Update lastRun timestamp (called by digest engine after processing)
 */
export const markRun = mutation({
  args: {
    id: v.id("streams"),
    lastRun: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastRun: args.lastRun,
      updated: args.lastRun,
    });
  },
});
