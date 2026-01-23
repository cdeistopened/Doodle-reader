/**
 * Convex functions for Doodle Scanner / Doodle OCR
 *
 * Handles scan job creation, status updates, and retrieval.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// =============================================================================
// QUERIES
// =============================================================================

/**
 * List all scan jobs for the current user
 */
export const list = query({
  args: {
    userId: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("scanJobs")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc");

    const jobs = await query.collect();

    // Filter by status if provided
    let filtered = jobs;
    if (args.status) {
      filtered = jobs.filter((j) => j.status === args.status);
    }

    // Apply limit
    if (args.limit) {
      filtered = filtered.slice(0, args.limit);
    }

    return filtered;
  },
});

/**
 * Get a single scan job by ID
 */
export const get = query({
  args: {
    jobId: v.id("scanJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get active jobs (analyzing or processing) for a user
 */
export const getActive = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("scanJobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return jobs.filter(
      (j) =>
        j.status === "analyzing" ||
        j.status === "processing" ||
        j.status === "pending"
    );
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new scan job
 */
export const create = mutation({
  args: {
    userId: v.string(),
    sourceType: v.union(v.literal("upload"), v.literal("camera")),
    fileName: v.string(),
    pageCount: v.number(),
    inputFileId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const jobId = await ctx.db.insert("scanJobs", {
      userId: args.userId,
      status: "pending",
      sourceType: args.sourceType,
      fileName: args.fileName,
      pageCount: args.pageCount,
      inputFileId: args.inputFileId,
      createdAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Update job with analysis results
 */
export const setAnalysis = mutation({
  args: {
    jobId: v.id("scanJobs"),
    analysis: v.object({
      documentType: v.string(),
      language: v.string(),
      hasFootnotes: v.boolean(),
      hasTwoColumns: v.boolean(),
      estimatedWordsPerPage: v.number(),
      recommendedChunkSize: v.number(),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "ready",
      analysis: args.analysis,
      analyzedAt: Date.now(),
    });
  },
});

/**
 * Set user preferences and start processing
 */
export const startProcessing = mutation({
  args: {
    jobId: v.id("scanJobs"),
    preferences: v.object({
      keepFrontMatter: v.boolean(),
      skipGoogleNotice: v.boolean(),
      includePageMarkers: v.boolean(),
      includeColumnMarkers: v.boolean(),
      outputFormat: v.union(v.literal("single"), v.literal("chapters")),
    }),
    chunksTotal: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "processing",
      preferences: args.preferences,
      chunksTotal: args.chunksTotal,
      chunksComplete: 0,
      startedAt: Date.now(),
    });
  },
});

/**
 * Update processing progress
 */
export const updateProgress = mutation({
  args: {
    jobId: v.id("scanJobs"),
    chunksComplete: v.number(),
    currentChunk: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      chunksComplete: args.chunksComplete,
      currentChunk: args.currentChunk,
    });
  },
});

/**
 * Mark job as complete
 */
export const complete = mutation({
  args: {
    jobId: v.id("scanJobs"),
    outputFileId: v.id("_storage"),
    outputChars: v.number(),
    processingTimeMs: v.number(),
    creditsUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "complete",
      outputFileId: args.outputFileId,
      outputChars: args.outputChars,
      processingTimeMs: args.processingTimeMs,
      creditsUsed: args.creditsUsed,
      completedAt: Date.now(),
    });
  },
});

/**
 * Mark job as failed
 */
export const fail = mutation({
  args: {
    jobId: v.id("scanJobs"),
    errorMessage: v.string(),
    errorChunk: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      errorChunk: args.errorChunk,
      completedAt: Date.now(),
    });
  },
});

/**
 * Delete a scan job and its associated files
 */
export const remove = mutation({
  args: {
    jobId: v.id("scanJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    // Delete associated files from storage
    if (job.inputFileId) {
      await ctx.storage.delete(job.inputFileId);
    }
    if (job.outputFileId) {
      await ctx.storage.delete(job.outputFileId);
    }

    // Delete the job record
    await ctx.db.delete(args.jobId);
  },
});
