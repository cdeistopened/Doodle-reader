/**
 * Document Queries and Mutations
 *
 * All operations require authenticated user (enforced via ctx.auth).
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// =============================================================================
// VALIDATION
// =============================================================================

const VALID_TYPES = ["article", "transcript", "scan", "video", "note"] as const;
const VALID_STATUSES = ["draft", "processing", "complete", "error", "archived"] as const;
const VALID_SOURCES = ["rss", "podcast", "youtube", "scan", "manual", "newsletter"] as const;

function validateType(type: string): void {
  if (!VALID_TYPES.includes(type as any)) {
    throw new Error(`Invalid type: ${type}. Must be one of: ${VALID_TYPES.join(", ")}`);
  }
}

function validateStatus(status: string): void {
  if (!VALID_STATUSES.includes(status as any)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(", ")}`);
  }
}

function validateSource(source: string): void {
  if (!VALID_SOURCES.includes(source as any)) {
    throw new Error(`Invalid source: ${source}. Must be one of: ${VALID_SOURCES.join(", ")}`);
  }
}

// Helper to check isRead status across document types
// Note: Only articles have isRead/isStarred. Transcripts are considered "read" by default.
function getIsRead(doc: { article?: { isRead?: boolean }; transcript?: unknown }): boolean {
  if (doc.article) return doc.article.isRead ?? false;
  if (doc.transcript) return true; // Transcripts don't have read status, treat as read
  return true; // Other types don't have read status
}

function getIsStarred(doc: { article?: { isStarred?: boolean } }): boolean {
  if (doc.article) return doc.article.isStarred ?? false;
  return false; // Only articles can be starred
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * List documents for the current user (lightweight - no content)
 * Use this for feed list views to save bandwidth
 */
export const listSummaries = query({
  args: {
    type: v.optional(v.string()),
    feedId: v.optional(v.string()),
    status: v.optional(v.string()),
    isRead: v.optional(v.boolean()),
    isStarred: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;
    let documents;

    // Use appropriate index based on filters
    if (args.type) {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("type", args.type as any)
        )
        .collect();
    } else if (args.status) {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", args.status as any)
        )
        .collect();
    } else {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    // Apply additional filters
    if (args.feedId) {
      documents = documents.filter(
        (d) => d.article?.feedId === args.feedId || d.transcript?.feedId === args.feedId
      );
    }

    if (args.isRead !== undefined) {
      documents = documents.filter((d) => getIsRead(d) === args.isRead);
    }

    if (args.isStarred !== undefined) {
      documents = documents.filter((d) => getIsStarred(d) === args.isStarred);
    }

    // Sort
    const sortField = args.sortBy || "created";
    const sortOrder = args.sortOrder || "desc";

    documents.sort((a, b) => {
      const aVal = (a as any)[sortField] || a.created;
      const bVal = (b as any)[sortField] || b.created;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Limit
    if (args.limit) {
      documents = documents.slice(0, args.limit);
    }

    // Return lightweight version - NO content, NO assets
    return documents.map((doc) => ({
      _id: doc._id,
      _creationTime: doc._creationTime,
      type: doc.type,
      source: doc.source,
      title: doc.title,
      created: doc.created,
      modified: doc.modified,
      status: doc.status,
      summary: doc.summary,
      tags: doc.tags,
      folderId: doc.folderId,
      article: doc.article,
      transcript: doc.transcript ? {
        feedUrl: doc.transcript.feedUrl,
        feedId: doc.transcript.feedId,
        podcastTitle: doc.transcript.podcastTitle,
        duration: doc.transcript.duration,
        pubDate: doc.transcript.pubDate,
      } : undefined,
      scan: doc.scan,
      video: doc.video,
      // Explicitly exclude: content, assets, ai
    }));
  },
});

/**
 * List all documents for the current user (FULL - includes content)
 * WARNING: High bandwidth - use listSummaries for list views
 */
export const list = query({
  args: {
    type: v.optional(v.string()),
    feedId: v.optional(v.string()),
    status: v.optional(v.string()),
    isRead: v.optional(v.boolean()),
    isStarred: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;
    let documents;

    // Use appropriate index based on filters
    if (args.type) {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("type", args.type as any)
        )
        .collect();
    } else if (args.status) {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", args.status as any)
        )
        .collect();
    } else {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    // Apply additional filters
    if (args.feedId) {
      documents = documents.filter(
        (d) => d.article?.feedId === args.feedId || d.transcript?.feedId === args.feedId
      );
    }

    if (args.isRead !== undefined) {
      documents = documents.filter((d) => getIsRead(d) === args.isRead);
    }

    if (args.isStarred !== undefined) {
      documents = documents.filter((d) => getIsStarred(d) === args.isStarred);
    }

    // Sort
    const sortField = args.sortBy || "created";
    const sortOrder = args.sortOrder || "desc";

    documents.sort((a, b) => {
      const aVal = (a as any)[sortField] || a.created;
      const bVal = (b as any)[sortField] || b.created;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Limit
    if (args.limit) {
      documents = documents.slice(0, args.limit);
    }

    return documents;
  },
});

/**
 * Get a single document by ID
 */
export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== identity.subject) return null;

    return doc;
  },
});

/**
 * Search documents by content/title
 */
export const search = query({
  args: {
    query: v.string(),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    // Search in content
    let results = await ctx.db
      .query("documents")
      .withSearchIndex("search_content", (q) => {
        let search = q.search("content", args.query).eq("userId", userId);
        if (args.type) {
          search = search.eq("type", args.type as any);
        }
        return search;
      })
      .take(args.limit || 50);

    // Also search in title and merge
    const titleResults = await ctx.db
      .query("documents")
      .withSearchIndex("search_title", (q) => {
        let search = q.search("title", args.query).eq("userId", userId);
        if (args.type) {
          search = search.eq("type", args.type as any);
        }
        return search;
      })
      .take(args.limit || 50);

    // Merge and dedupe
    const seen = new Set(results.map((r) => r._id));
    for (const r of titleResults) {
      if (!seen.has(r._id)) {
        results.push(r);
      }
    }

    return results.slice(0, args.limit || 50);
  },
});

/**
 * Count documents matching filters
 */
export const count = query({
  args: {
    type: v.optional(v.string()),
    feedId: v.optional(v.string()),
    isRead: v.optional(v.boolean()),
    isStarred: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const userId = identity.subject;
    let documents;

    if (args.type) {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("type", args.type as any)
        )
        .collect();
    } else {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    // Apply filters
    if (args.feedId) {
      documents = documents.filter(
        (d) => d.article?.feedId === args.feedId || d.transcript?.feedId === args.feedId
      );
    }

    if (args.isRead !== undefined) {
      documents = documents.filter((d) => getIsRead(d) === args.isRead);
    }

    if (args.isStarred !== undefined) {
      documents = documents.filter((d) => getIsStarred(d) === args.isStarred);
    }

    return documents.length;
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new document
 */
export const create = mutation({
  args: {
    type: v.string(),
    source: v.string(),
    title: v.string(),
    content: v.string(),
    status: v.optional(v.string()),
    summary: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    folderId: v.optional(v.string()),
    article: v.optional(v.any()),
    transcript: v.optional(v.any()),
    scan: v.optional(v.any()),
    video: v.optional(v.any()),
    ai: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Validate enum fields
    validateType(args.type);
    validateSource(args.source);
    if (args.status) validateStatus(args.status);

    const now = new Date().toISOString();

    const id = await ctx.db.insert("documents", {
      userId: identity.subject,
      type: args.type as any,
      source: args.source as any,
      title: args.title,
      content: args.content,
      status: (args.status as any) || "complete",
      summary: args.summary,
      tags: args.tags || [],
      folderId: args.folderId,
      created: now,
      modified: now,
      article: args.article,
      transcript: args.transcript,
      scan: args.scan,
      video: args.video,
      ai: args.ai,
    });

    return id;
  },
});

/**
 * Update a document
 */
export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    status: v.optional(v.string()),
    summary: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    folderId: v.optional(v.string()),
    article: v.optional(v.any()),
    transcript: v.optional(v.any()),
    scan: v.optional(v.any()),
    video: v.optional(v.any()),
    ai: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== identity.subject) {
      throw new Error("Document not found");
    }

    // Validate enum fields if provided
    if (args.status) validateStatus(args.status);

    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.id, {
      ...filtered,
      modified: new Date().toISOString(),
    });

    return args.id;
  },
});

/**
 * Delete a document
 */
export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== identity.subject) {
      throw new Error("Document not found");
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Bulk delete documents
 */
export const removeMany = mutation({
  args: { ids: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc && doc.userId === identity.subject) {
        await ctx.db.delete(id);
      }
    }
  },
});

// =============================================================================
// CONVENIENCE MUTATIONS
// =============================================================================

/**
 * Mark document as read/unread
 */
export const markAsRead = mutation({
  args: {
    id: v.id("documents"),
    isRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== identity.subject) {
      throw new Error("Document not found");
    }

    if (doc.article) {
      await ctx.db.patch(args.id, {
        article: {
          ...doc.article,
          isRead: args.isRead ?? true,
        },
        modified: new Date().toISOString(),
      });
    }
  },
});

/**
 * Toggle star status
 */
export const toggleStar = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== identity.subject) {
      throw new Error("Document not found");
    }

    if (doc.article) {
      await ctx.db.patch(args.id, {
        article: {
          ...doc.article,
          isStarred: !doc.article.isStarred,
        },
        modified: new Date().toISOString(),
      });
    }
  },
});

/**
 * Mark all documents in a feed as read
 */
export const markFeedAsRead = mutation({
  args: { feedId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const userId = identity.subject;
    const now = new Date().toISOString();

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Find unread documents in this feed
    // Note: Only articles have isRead status. Transcripts don't track read state.
    const feedDocs = documents.filter(
      (d) =>
        d.article?.feedId === args.feedId &&
        d.article?.isRead === false
    );

    for (const doc of feedDocs) {
      await ctx.db.patch(doc._id, {
        article: { ...doc.article!, isRead: true },
        modified: now,
      });
    }
  },
});

/**
 * Update AI summary
 */
export const updateSummary = mutation({
  args: {
    id: v.id("documents"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== identity.subject) {
      throw new Error("Document not found");
    }

    await ctx.db.patch(args.id, {
      summary: args.summary,
      modified: new Date().toISOString(),
    });
  },
});

/**
 * Add tags
 */
export const addTags = mutation({
  args: {
    id: v.id("documents"),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== identity.subject) {
      throw new Error("Document not found");
    }

    const existingTags = new Set(doc.tags);
    for (const tag of args.tags) {
      existingTags.add(tag);
    }

    await ctx.db.patch(args.id, {
      tags: Array.from(existingTags),
      modified: new Date().toISOString(),
    });
  },
});

/**
 * Remove tags
 */
export const removeTags = mutation({
  args: {
    id: v.id("documents"),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== identity.subject) {
      throw new Error("Document not found");
    }

    const tagsToRemove = new Set(args.tags);
    const newTags = doc.tags.filter((t) => !tagsToRemove.has(t));

    await ctx.db.patch(args.id, {
      tags: newTags,
      modified: new Date().toISOString(),
    });
  },
});
