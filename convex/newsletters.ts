/**
 * Newsletter Feed Management
 *
 * Handles creating email-to-RSS feeds via kill-the-newsletter.com
 */

import { v } from "convex/values";
import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

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
 * Store a newsletter feed (internal, called by action)
 */
export const storeNewsletterFeed = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    feedUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("newsletterFeeds", {
      userId: args.userId,
      name: args.name,
      email: args.email,
      feedUrl: args.feedUrl,
      createdAt: Date.now(),
    });

    return id;
  },
});

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

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Create a new newsletter feed via kill-the-newsletter.com
 *
 * This action:
 * 1. POSTs to kill-the-newsletter.com with the feed name
 * 2. Parses the HTML response to extract email and feed URL
 * 3. Stores the result in the database
 */
export const createNewsletterFeed = action({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Build form data
    const formData = new URLSearchParams();
    formData.append("title", args.name);

    // POST to kill-the-newsletter.com
    const response = await fetch("https://kill-the-newsletter.com/feeds", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to create newsletter feed: ${response.status}`);
    }

    const html = await response.text();

    // Parse the response to extract email and feed URL
    // The email is in format: {publicId}@kill-the-newsletter.com
    // The feed URL is in format: https://kill-the-newsletter.com/feeds/{publicId}.xml
    //
    // These appear in input elements with the values

    // Extract the publicId from the feed URL (more reliable pattern)
    // Pattern: https://kill-the-newsletter.com/feeds/{publicId}.xml
    const feedUrlMatch = html.match(
      /https:\/\/kill-the-newsletter\.com\/feeds\/([a-z0-9]+)\.xml/i
    );

    if (!feedUrlMatch) {
      throw new Error("Failed to parse feed URL from response");
    }

    const publicId = feedUrlMatch[1];
    const feedUrl = `https://kill-the-newsletter.com/feeds/${publicId}.xml`;
    const email = `${publicId}@kill-the-newsletter.com`;

    // Get the user identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Store in database
    const id = await ctx.runMutation(internal.newsletters.storeNewsletterFeed, {
      userId: identity.subject,
      name: args.name,
      email,
      feedUrl,
    });

    return {
      id,
      name: args.name,
      email,
      feedUrl,
    };
  },
});
