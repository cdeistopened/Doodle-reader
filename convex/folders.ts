/**
 * Folder Queries and Mutations
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// =============================================================================
// QUERIES
// =============================================================================

/**
 * List all folders for the current user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const folders = await ctx.db
      .query("folders")
      .withIndex("by_user_order", (q) => q.eq("userId", identity.subject))
      .collect();

    return folders;
  },
});

/**
 * Get a single folder by ID
 */
export const get = query({
  args: { id: v.id("folders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const folder = await ctx.db.get(args.id);
    if (!folder || folder.userId !== identity.subject) return null;

    return folder;
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new folder
 */
export const create = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
    isOpen: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const userId = identity.subject;

    // Get max sort order
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const maxOrder = folders.reduce((max, f) => Math.max(max, f.sortOrder), -1);

    const id = await ctx.db.insert("folders", {
      userId,
      name: args.name,
      color: args.color,
      isOpen: args.isOpen ?? true,
      sortOrder: maxOrder + 1,
    });

    return id;
  },
});

/**
 * Update a folder
 */
export const update = mutation({
  args: {
    id: v.id("folders"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    isOpen: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const folder = await ctx.db.get(args.id);
    if (!folder || folder.userId !== identity.subject) {
      throw new Error("Folder not found");
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
 * Delete a folder (feeds in folder become unorganized)
 */
export const remove = mutation({
  args: { id: v.id("folders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const folder = await ctx.db.get(args.id);
    if (!folder || folder.userId !== identity.subject) {
      throw new Error("Folder not found");
    }

    // Remove folder reference from feeds
    const feeds = await ctx.db
      .query("feeds")
      .withIndex("by_user_folder", (q) =>
        q.eq("userId", identity.subject).eq("folderId", args.id)
      )
      .collect();

    for (const feed of feeds) {
      await ctx.db.patch(feed._id, { folderId: undefined });
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Reorder folders
 */
export const reorder = mutation({
  args: { folderIds: v.array(v.id("folders")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    for (let i = 0; i < args.folderIds.length; i++) {
      const folder = await ctx.db.get(args.folderIds[i]);
      if (folder && folder.userId === identity.subject) {
        await ctx.db.patch(args.folderIds[i], { sortOrder: i });
      }
    }
  },
});

/**
 * Toggle folder open/closed
 */
export const toggleOpen = mutation({
  args: { id: v.id("folders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const folder = await ctx.db.get(args.id);
    if (!folder || folder.userId !== identity.subject) {
      throw new Error("Folder not found");
    }

    await ctx.db.patch(args.id, { isOpen: !folder.isOpen });
  },
});
