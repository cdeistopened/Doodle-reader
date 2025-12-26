/**
 * Feed Queries and Mutations
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// =============================================================================
// QUERIES
// =============================================================================

/**
 * List all feeds for the current user
 */
export const list = query({
  args: {
    feedType: v.optional(v.string()),
    folderId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;
    let feeds;

    if (args.feedType) {
      feeds = await ctx.db
        .query("feeds")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("feedType", args.feedType as any)
        )
        .collect();
    } else if (args.folderId) {
      feeds = await ctx.db
        .query("feeds")
        .withIndex("by_user_folder", (q) =>
          q.eq("userId", userId).eq("folderId", args.folderId)
        )
        .collect();
    } else {
      feeds = await ctx.db
        .query("feeds")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    return feeds;
  },
});

/**
 * Get a single feed by ID
 */
export const get = query({
  args: { id: v.id("feeds") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const feed = await ctx.db.get(args.id);
    if (!feed || feed.userId !== identity.subject) return null;

    return feed;
  },
});

/**
 * Get feed by URL (for duplicate detection)
 */
export const getByUrl = query({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    const feeds = await ctx.db
      .query("feeds")
      .withIndex("by_user_url", (q) => q.eq("userId", userId).eq("url", args.url))
      .collect();

    return feeds[0] || null;
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new feed subscription
 */
export const create = mutation({
  args: {
    url: v.string(),
    siteUrl: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    folderId: v.optional(v.string()),
    feedType: v.string(),
    contextPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const userId = identity.subject;

    // Check for duplicate
    const existing = await ctx.db
      .query("feeds")
      .withIndex("by_user_url", (q) => q.eq("userId", userId).eq("url", args.url))
      .first();

    if (existing) {
      throw new Error("Feed already subscribed");
    }

    const id = await ctx.db.insert("feeds", {
      userId,
      url: args.url,
      siteUrl: args.siteUrl,
      name: args.name,
      description: args.description,
      icon: args.icon,
      color: args.color,
      folderId: args.folderId,
      feedType: args.feedType as any,
      contextPrompt: args.contextPrompt,
      itemCount: 0,
      unreadCount: 0,
    });

    return id;
  },
});

/**
 * Update a feed
 */
export const update = mutation({
  args: {
    id: v.id("feeds"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    folderId: v.optional(v.string()),
    contextPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const feed = await ctx.db.get(args.id);
    if (!feed || feed.userId !== identity.subject) {
      throw new Error("Feed not found");
    }

    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.id, filtered);
    return args.id;
  },
});

/**
 * Update feed sync state
 */
export const updateSyncState = mutation({
  args: {
    id: v.id("feeds"),
    lastFetched: v.optional(v.string()),
    fetchError: v.optional(v.string()),
    itemCount: v.optional(v.number()),
    unreadCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const feed = await ctx.db.get(args.id);
    if (!feed || feed.userId !== identity.subject) {
      throw new Error("Feed not found");
    }

    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.id, filtered);
  },
});

/**
 * Delete a feed and optionally its documents
 */
export const remove = mutation({
  args: {
    id: v.id("feeds"),
    deleteDocuments: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const feed = await ctx.db.get(args.id);
    if (!feed || feed.userId !== identity.subject) {
      throw new Error("Feed not found");
    }

    // Delete associated documents if requested
    if (args.deleteDocuments) {
      const documents = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", identity.subject))
        .collect();

      const feedId = args.id;
      const feedDocs = documents.filter(
        (d) => d.article?.feedId === feedId || d.transcript?.feedId === feedId
      );

      for (const doc of feedDocs) {
        await ctx.db.delete(doc._id);
      }
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Increment unread count
 */
export const incrementUnread = mutation({
  args: {
    id: v.id("feeds"),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const feed = await ctx.db.get(args.id);
    if (!feed || feed.userId !== identity.subject) {
      throw new Error("Feed not found");
    }

    await ctx.db.patch(args.id, {
      unreadCount: (feed.unreadCount || 0) + (args.count || 1),
      itemCount: (feed.itemCount || 0) + (args.count || 1),
    });
  },
});

/**
 * Decrement unread count
 */
export const decrementUnread = mutation({
  args: { id: v.id("feeds") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const feed = await ctx.db.get(args.id);
    if (!feed || feed.userId !== identity.subject) {
      throw new Error("Feed not found");
    }

    await ctx.db.patch(args.id, {
      unreadCount: Math.max(0, (feed.unreadCount || 0) - 1),
    });
  },
});
