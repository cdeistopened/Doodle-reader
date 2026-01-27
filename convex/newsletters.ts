/**
 * Newsletter Feed Management
 *
 * Handles creating email-to-RSS feeds via kill-the-newsletter.com
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// =============================================================================
// QUERIES
// =============================================================================

/**
 * List all newsletter feeds for the current user
 */
export const listNewsletterFeeds = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;
    const feeds = await ctx.db
      .query("newsletterFeeds")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return feeds;
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Delete a newsletter feed by ID
 */
export const deleteNewsletterFeed = mutation({
  args: {
    id: v.id("newsletterFeeds"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const feed = await ctx.db.get(args.id);
    if (!feed || feed.userId !== identity.subject) {
      throw new Error("Newsletter feed not found");
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Save a newsletter feed (called from client after browser-side creation)
 *
 * The browser makes the POST to kill-the-newsletter.com directly to avoid
 * Cloudflare blocking server-side requests. Then it calls this mutation
 * to persist the result.
 */
export const saveNewsletterFeed = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    feedUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const id = await ctx.db.insert("newsletterFeeds", {
      userId: identity.subject,
      name: args.name,
      email: args.email,
      feedUrl: args.feedUrl,
      createdAt: Date.now(),
    });

    return {
      id,
      name: args.name,
      email: args.email,
      feedUrl: args.feedUrl,
    };
  },
});
