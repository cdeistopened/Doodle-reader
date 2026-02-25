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

const STARTER_STREAM_TEMPLATES = [
  {
    id: "ai-tech-daily",
    name: "AI & Tech Daily",
    description: "Daily signal from AI builders and developer channels.",
    sources: [
      {
        type: "rss" as const,
        name: "Simon Willison",
        url: "https://simonwillison.net/atom/everything/",
      },
      {
        type: "rss" as const,
        name: "Experimental History",
        url: "https://www.experimental-history.com/feed",
      },
      {
        type: "youtube_channel" as const,
        name: "Google for Developers",
        url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw",
      },
    ],
    filters: {
      excludeKeywords: ["sponsored", "hiring", "job posting"],
      maxItemsPerDigest: 12,
    },
    format: {
      style: "newsletter" as const,
      customPrompt:
        "Write crisp summaries with practical takeaways and one sentence on why each item matters right now.",
    },
  },
  {
    id: "learning-research",
    name: "Learning & Research",
    description: "Research and explainer content across writing + video.",
    sources: [
      {
        type: "rss" as const,
        name: "Stratechery",
        url: "https://stratechery.com/feed/",
      },
      {
        type: "rss" as const,
        name: "Daring Fireball",
        url: "https://daringfireball.net/feeds/main",
      },
      {
        type: "youtube_channel" as const,
        name: "Veritasium",
        url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
      },
    ],
    filters: {
      excludeKeywords: ["sponsored", "press release"],
      maxItemsPerDigest: 12,
    },
    format: {
      style: "newsletter" as const,
      customPrompt:
        "Prioritize the key claim, supporting evidence, and one implication for a curious generalist reader.",
    },
  },
] as const;

function getStarterTemplate(templateId: string) {
  return STARTER_STREAM_TEMPLATES.find((template) => template.id === templateId) || null;
}

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

/**
 * Starter stream templates used in first-digest activation flow.
 */
export const starterTemplates = query({
  args: {},
  handler: async () => {
    return STARTER_STREAM_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      sourceCount: template.sources.length,
      sources: template.sources,
      defaultSchedule: "daily" as const,
    }));
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
 * Create a stream from a built-in starter template.
 */
export const createFromStarter = mutation({
  args: {
    templateId: v.string(),
    deliveryEmail: v.string(),
    schedule: v.optional(scheduleValidator),
    deliveryTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const template = getStarterTemplate(args.templateId);
    if (!template) {
      throw new Error("Starter template not found");
    }

    const now = Date.now();
    const streamId = await ctx.db.insert("streams", {
      userId: identity.subject,
      name: template.name,
      description: template.description,
      sources: template.sources.map((source) => ({
        type: source.type,
        url: source.url,
        name: source.name,
      })),
      filters: {
        excludeKeywords: template.filters.excludeKeywords ? [...template.filters.excludeKeywords] : undefined,
        maxItemsPerDigest: template.filters.maxItemsPerDigest,
      },
      format: {
        style: template.format.style,
        customPrompt: template.format.customPrompt,
      },
      schedule: args.schedule || "daily",
      deliveryEmail: args.deliveryEmail,
      deliveryTime: args.deliveryTime,
      isActive: true,
      created: now,
      updated: now,
    });

    return streamId;
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
