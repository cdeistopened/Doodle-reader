/**
 * Boards - Curated Collections
 *
 * Boards are like Feedly boards or Pinterest boards - curated collections
 * of saved articles, transcripts, and other content.
 *
 * Key differences from Folders:
 * - Folders organize feeds, Boards organize individual items
 * - Items can be in multiple boards
 * - Boards can be shared publicly
 * - Designed for export to Notion/Obsidian
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get all boards for the current user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const userId = identity.subject;
    const boards = await ctx.db
      .query("boards")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .collect();

    return boards;
  },
});

/**
 * Get a single board by ID with its items
 */
export const get = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const board = await ctx.db.get(boardId);

    if (!board) {
      return null;
    }

    // Check access - must be owner or board is public
    if (!board.isPublic && (!identity || identity.subject !== board.userId)) {
      return null;
    }

    // Get items in this board
    const boardItems = await ctx.db
      .query("boardItems")
      .withIndex("by_board_order", (q) => q.eq("boardId", boardId))
      .collect();

    // Fetch the actual documents
    const items = await Promise.all(
      boardItems.map(async (bi) => {
        const doc = await ctx.db.get(bi.documentId);
        return doc ? { ...bi, document: doc } : null;
      })
    );

    return {
      ...board,
      items: items.filter(Boolean),
    };
  },
});

/**
 * Get a public board by its share slug
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const board = await ctx.db
      .query("boards")
      .withIndex("by_share_slug", (q) => q.eq("shareSlug", slug))
      .first();

    if (!board || !board.isPublic) {
      return null;
    }

    // Get items
    const boardItems = await ctx.db
      .query("boardItems")
      .withIndex("by_board_order", (q) => q.eq("boardId", board._id))
      .collect();

    const items = await Promise.all(
      boardItems.map(async (bi) => {
        const doc = await ctx.db.get(bi.documentId);
        return doc ? { ...bi, document: doc } : null;
      })
    );

    return {
      ...board,
      items: items.filter(Boolean),
    };
  },
});

/**
 * Get which boards a document is in
 */
export const getBoardsForDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const userId = identity.subject;

    const boardItems = await ctx.db
      .query("boardItems")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();

    // Filter to user's boards and fetch board details
    const boards = await Promise.all(
      boardItems.map(async (bi) => {
        const board = await ctx.db.get(bi.boardId);
        if (board && board.userId === userId) {
          return { ...board, boardItemId: bi._id, note: bi.note };
        }
        return null;
      })
    );

    return boards.filter(Boolean);
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new board
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;
    const now = new Date().toISOString();

    // Get next sort order
    const existingBoards = await ctx.db
      .query("boards")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const maxOrder = existingBoards.reduce(
      (max, b) => Math.max(max, b.sortOrder),
      -1
    );

    const boardId = await ctx.db.insert("boards", {
      userId,
      name: args.name,
      description: args.description,
      icon: args.icon,
      color: args.color,
      isPublic: false,
      sortOrder: maxOrder + 1,
      itemCount: 0,
      created: now,
      updated: now,
    });

    return boardId;
  },
});

/**
 * Update a board
 */
export const update = mutation({
  args: {
    boardId: v.id("boards"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, { boardId, ...updates }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== identity.subject) {
      throw new Error("Board not found");
    }

    const now = new Date().toISOString();

    // Generate share slug if making public
    let shareSlug = board.shareSlug;
    if (updates.isPublic && !shareSlug) {
      shareSlug = generateSlug(updates.name || board.name);
    }

    await ctx.db.patch(boardId, {
      ...updates,
      shareSlug,
      updated: now,
    });
  },
});

/**
 * Delete a board
 */
export const remove = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== identity.subject) {
      throw new Error("Board not found");
    }

    // Delete all board items first
    const items = await ctx.db
      .query("boardItems")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    // Delete the board
    await ctx.db.delete(boardId);
  },
});

/**
 * Add an item to a board
 */
export const addItem = mutation({
  args: {
    boardId: v.id("boards"),
    documentId: v.id("documents"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { boardId, documentId, note }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    // Verify board ownership
    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== userId) {
      throw new Error("Board not found");
    }

    // Check if already in board
    const existing = await ctx.db
      .query("boardItems")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .filter((q) => q.eq(q.field("documentId"), documentId))
      .first();

    if (existing) {
      // Update note if provided
      if (note !== undefined) {
        await ctx.db.patch(existing._id, { note });
      }
      return existing._id;
    }

    // Get next sort order
    const existingItems = await ctx.db
      .query("boardItems")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();

    const maxOrder = existingItems.reduce(
      (max, item) => Math.max(max, item.sortOrder),
      -1
    );

    const now = new Date().toISOString();

    const itemId = await ctx.db.insert("boardItems", {
      userId,
      boardId,
      documentId,
      note,
      sortOrder: maxOrder + 1,
      addedAt: now,
    });

    // Update board item count
    await ctx.db.patch(boardId, {
      itemCount: board.itemCount + 1,
      updated: now,
    });

    return itemId;
  },
});

/**
 * Remove an item from a board
 */
export const removeItem = mutation({
  args: {
    boardId: v.id("boards"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, { boardId, documentId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== identity.subject) {
      throw new Error("Board not found");
    }

    const item = await ctx.db
      .query("boardItems")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .filter((q) => q.eq(q.field("documentId"), documentId))
      .first();

    if (item) {
      await ctx.db.delete(item._id);

      // Update board item count
      await ctx.db.patch(boardId, {
        itemCount: Math.max(0, board.itemCount - 1),
        updated: new Date().toISOString(),
      });
    }
  },
});

/**
 * Update item note
 */
export const updateItemNote = mutation({
  args: {
    boardItemId: v.id("boardItems"),
    note: v.string(),
  },
  handler: async (ctx, { boardItemId, note }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const item = await ctx.db.get(boardItemId);
    if (!item || item.userId !== identity.subject) {
      throw new Error("Item not found");
    }

    await ctx.db.patch(boardItemId, { note });
  },
});

/**
 * Reorder boards
 */
export const reorderBoards = mutation({
  args: {
    boardIds: v.array(v.id("boards")),
  },
  handler: async (ctx, { boardIds }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    for (let i = 0; i < boardIds.length; i++) {
      const board = await ctx.db.get(boardIds[i]);
      if (board && board.userId === userId) {
        await ctx.db.patch(boardIds[i], { sortOrder: i });
      }
    }
  },
});

/**
 * Reorder items within a board
 */
export const reorderItems = mutation({
  args: {
    boardId: v.id("boards"),
    itemIds: v.array(v.id("boardItems")),
  },
  handler: async (ctx, { boardId, itemIds }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== identity.subject) {
      throw new Error("Board not found");
    }

    for (let i = 0; i < itemIds.length; i++) {
      await ctx.db.patch(itemIds[i], { sortOrder: i });
    }
  },
});

// =============================================================================
// HELPERS
// =============================================================================

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);

  // Add random suffix for uniqueness
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}
