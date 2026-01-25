/**
 * Convex Schema for Doodle Reader
 *
 * This schema mirrors the types in lib/storage/types.ts
 * with userId added for multi-tenant support.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// =============================================================================
// REUSABLE VALIDATORS
// =============================================================================

const contentType = v.union(
  v.literal("article"),
  v.literal("transcript"),
  v.literal("scan"),
  v.literal("video"),
  v.literal("note")
);

const contentStatus = v.union(
  v.literal("draft"),
  v.literal("processing"),
  v.literal("complete"),
  v.literal("error"),
  v.literal("archived")
);

const sourceType = v.union(
  v.literal("rss"),
  v.literal("podcast"),
  v.literal("youtube"),
  v.literal("scan"),
  v.literal("manual"),
  v.literal("newsletter")
);

const feedType = v.union(
  v.literal("rss"),
  v.literal("podcast"),
  v.literal("youtube"),
  v.literal("newsletter")
);

// Chapter for podcasts/videos
const chapter = v.object({
  start: v.number(),
  end: v.number(),
  title: v.string(),
  summary: v.optional(v.string()),
});

// AI Metadata
const aiMetadata = v.object({
  embeddingsGenerated: v.optional(v.boolean()),
  summaryModel: v.optional(v.string()),
  topicsExtracted: v.optional(v.array(v.string())),
  qualityScore: v.optional(v.number()),
  lastProcessed: v.optional(v.string()),
});

// =============================================================================
// CONTENT ASSETS - Tracks raw, polished, and derived content
// =============================================================================

// Raw content from original source
const rawContent = v.object({
  content: v.string(),
  generatedAt: v.string(),
  source: v.union(
    v.literal("assemblyai"),
    v.literal("gemini-transcribe"),
    v.literal("youtube-captions"),
    v.literal("ocr"),
    v.literal("rss-fetch")
  ),
  // Optional metadata about the transcription
  durationMs: v.optional(v.number()),
  wordCount: v.optional(v.number()),
  confidence: v.optional(v.number()),
});

// Polished/edited version
const polishedContent = v.object({
  content: v.string(),
  generatedAt: v.string(),
  model: v.string(),              // e.g., "gemini-3-flash-preview"
  contextPrompt: v.optional(v.string()),  // Feed-specific context used
  editedByUser: v.optional(v.boolean()),  // Was it manually edited?
});

// Summary entry
const summaryEntry = v.object({
  type: v.union(
    v.literal("tldr"),
    v.literal("detailed"),
    v.literal("bullets"),
    v.literal("executive"),
    v.literal("custom")
  ),
  content: v.string(),
  generatedAt: v.string(),
  model: v.string(),
  prompt: v.optional(v.string()),  // Custom prompt if used
});

// Extracted insights
const insightsData = v.object({
  topics: v.optional(v.array(v.string())),
  keyPoints: v.optional(v.array(v.string())),
  quotes: v.optional(v.array(v.object({
    text: v.string(),
    speaker: v.optional(v.string()),
    timestamp: v.optional(v.string()),
  }))),
  actionItems: v.optional(v.array(v.string())),
  entities: v.optional(v.array(v.object({
    name: v.string(),
    type: v.string(),  // "person", "company", "product", etc.
  }))),
  generatedAt: v.string(),
  model: v.string(),
});

// The full assets object
const documentAssets = v.object({
  raw: v.optional(rawContent),
  polished: v.optional(polishedContent),
  summaries: v.optional(v.array(summaryEntry)),
  insights: v.optional(insightsData),
});

// Article properties (also used for podcast episodes)
const articleProperties = v.object({
  url: v.string(),
  feedId: v.string(),
  feedUrl: v.string(),
  siteName: v.string(),
  author: v.optional(v.string()),
  authorUrl: v.optional(v.string()),
  pubDate: v.string(),
  wordCount: v.optional(v.number()),
  readTime: v.optional(v.number()),
  isRead: v.boolean(),
  isStarred: v.boolean(),
  excerpt: v.optional(v.string()),
  mediaType: v.optional(v.union(v.literal("text"), v.literal("video"), v.literal("audio"))),
  // Podcast-specific fields
  audioUrl: v.optional(v.string()),
  duration: v.optional(v.string()),  // Duration in seconds as string
  transcriptionStatus: v.optional(v.union(
    v.literal("none"),
    v.literal("processing"),
    v.literal("complete"),
    v.literal("error")
  )),
  transcript: v.optional(v.string()),
});

// Transcript properties
const transcriptProperties = v.object({
  feedUrl: v.string(),
  feedId: v.string(),
  podcastTitle: v.string(),
  audioUrl: v.string(),
  duration: v.number(),
  pubDate: v.string(),
  episodeNumber: v.optional(v.number()),
  speakers: v.optional(v.array(v.string())),
  chapters: v.optional(v.array(chapter)),
  transcriptionCost: v.optional(v.number()),
});

// Scan properties
const scanProperties = v.object({
  sourceFile: v.string(),
  pageCount: v.number(),
  pageRange: v.optional(v.string()),
  parentDocumentId: v.optional(v.string()),
  ocrConfidence: v.optional(v.number()),
  dateScanned: v.string(),
});

// Video properties
const videoProperties = v.object({
  videoUrl: v.string(),
  videoId: v.string(),
  channelName: v.string(),
  channelId: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  duration: v.number(),
  pubDate: v.string(),
  chapters: v.optional(v.array(chapter)),
});

// =============================================================================
// SCHEMA DEFINITION
// =============================================================================

export default defineSchema({
  // ---------------------------------------------------------------------------
  // DOCUMENTS
  // ---------------------------------------------------------------------------
  documents: defineTable({
    // Multi-tenant: required for all documents
    userId: v.string(),

    // Identity
    type: contentType,
    source: sourceType,

    // Core metadata
    title: v.string(),
    created: v.string(),
    modified: v.string(),
    status: contentStatus,

    // Content
    content: v.string(),
    summary: v.optional(v.string()),

    // Organization
    tags: v.array(v.string()),
    folderId: v.optional(v.string()),

    // Type-specific properties (only one will be present based on type)
    article: v.optional(articleProperties),
    transcript: v.optional(transcriptProperties),
    scan: v.optional(scanProperties),
    video: v.optional(videoProperties),

    // AI metadata
    ai: v.optional(aiMetadata),

    // Content assets: raw, polished, summaries, insights
    // Tracks lineage between original and derived content
    assets: v.optional(documentAssets),
  })
    // Primary index: list documents by user
    .index("by_user", ["userId"])
    // Filter by type
    .index("by_user_type", ["userId", "type"])
    // Filter by feed (for articles/transcripts)
    .index("by_user_feedId", ["userId", "article.feedId"])
    // Filter by status
    .index("by_user_status", ["userId", "status"])
    // Sort by date
    .index("by_user_created", ["userId", "created"])
    .index("by_user_modified", ["userId", "modified"])
    // Search (Convex full-text search)
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["userId", "type"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId", "type"],
    }),

  // ---------------------------------------------------------------------------
  // FEEDS
  // ---------------------------------------------------------------------------
  feeds: defineTable({
    // Multi-tenant
    userId: v.string(),

    // Identity
    url: v.string(),
    siteUrl: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    folderId: v.optional(v.string()),

    // Feed type
    feedType: feedType,

    // Transcript polishing context (for podcasts)
    contextPrompt: v.optional(v.string()),

    // Sync state
    lastFetched: v.optional(v.string()),
    fetchError: v.optional(v.string()),
    itemCount: v.optional(v.number()),
    unreadCount: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_url", ["userId", "url"])
    .index("by_user_type", ["userId", "feedType"])
    .index("by_user_folder", ["userId", "folderId"]),

  // ---------------------------------------------------------------------------
  // FOLDERS
  // ---------------------------------------------------------------------------
  folders: defineTable({
    // Multi-tenant
    userId: v.string(),

    name: v.string(),
    color: v.optional(v.string()),
    isOpen: v.boolean(),
    sortOrder: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_order", ["userId", "sortOrder"]),

  // ---------------------------------------------------------------------------
  // NEWSLETTER FEEDS (Email-to-RSS)
  // ---------------------------------------------------------------------------
  newsletterFeeds: defineTable({
    // Multi-tenant
    userId: v.string(),

    // Newsletter identity
    name: v.string(),
    email: v.string(),
    feedUrl: v.string(),

    // Timestamps
    createdAt: v.number(),
  })
    .index("by_user", ["userId"]),

  // ---------------------------------------------------------------------------
  // SUBSCRIPTIONS (Stripe Integration)
  // ---------------------------------------------------------------------------
  subscriptions: defineTable({
    // Multi-tenant
    userId: v.string(),

    // Stripe IDs
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),

    // Subscription status
    status: v.union(
      v.literal("free"),
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("unpaid")
    ),

    // Plan details
    plan: v.union(
      v.literal("free"),
      v.literal("pro"),
      v.literal("team")
    ),

    // Billing period
    currentPeriodStart: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.string()),
    cancelAtPeriodEnd: v.optional(v.boolean()),

    // Timestamps
    created: v.string(),
    updated: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"]),

  // ---------------------------------------------------------------------------
  // USAGE TRACKING
  // ---------------------------------------------------------------------------
  usage: defineTable({
    // Multi-tenant
    userId: v.string(),

    // Billing period (YYYY-MM format for monthly tracking)
    period: v.string(),

    transcriptions: v.optional(v.number()),
    summariesGenerated: v.optional(v.number()),
    pdfPagesScanned: v.optional(v.number()),

    // Timestamps
    updated: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_period", ["userId", "period"]),

  // ---------------------------------------------------------------------------
  // BOARDS (Curated Collections)
  // ---------------------------------------------------------------------------
  boards: defineTable({
    // Multi-tenant
    userId: v.string(),

    // Identity
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),  // emoji or lucide icon name
    color: v.optional(v.string()),

    // Visibility
    isPublic: v.boolean(),
    shareSlug: v.optional(v.string()),  // URL-friendly slug for sharing

    // Organization
    sortOrder: v.number(),

    // Stats (denormalized for performance)
    itemCount: v.number(),

    // Timestamps
    created: v.string(),
    updated: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_order", ["userId", "sortOrder"])
    .index("by_share_slug", ["shareSlug"]),

  // ---------------------------------------------------------------------------
  // BOARD ITEMS (Many-to-Many: Documents ↔ Boards)
  // ---------------------------------------------------------------------------
  boardItems: defineTable({
    // Multi-tenant
    userId: v.string(),

    // References
    boardId: v.id("boards"),
    documentId: v.id("documents"),

    // User annotation
    note: v.optional(v.string()),

    // Position within board
    sortOrder: v.number(),

    // Timestamps
    addedAt: v.string(),
  })
    .index("by_board", ["boardId"])
    .index("by_board_order", ["boardId", "sortOrder"])
    .index("by_document", ["documentId"])
    .index("by_user", ["userId"]),

  // ---------------------------------------------------------------------------
  // SCAN JOBS (Doodle Scanner / Doodle OCR)
  // ---------------------------------------------------------------------------
  scanJobs: defineTable({
    // Multi-tenant
    userId: v.string(),

    // Job status
    status: v.union(
      v.literal("pending"),      // Waiting to start
      v.literal("analyzing"),    // Pre-flight analysis
      v.literal("ready"),        // Analysis complete, awaiting user confirmation
      v.literal("processing"),   // OCR in progress
      v.literal("complete"),     // Done
      v.literal("failed")        // Error
    ),

    // Input source
    sourceType: v.union(
      v.literal("upload"),       // User uploaded PDF
      v.literal("camera")        // Captured via PageSnap/Doodle Scanner
    ),
    fileName: v.string(),
    pageCount: v.number(),

    // Storage references
    inputFileId: v.optional(v.id("_storage")),    // Convex file storage for input PDF
    outputFileId: v.optional(v.id("_storage")),   // Convex file storage for output markdown

    // Pre-flight analysis results
    analysis: v.optional(v.object({
      documentType: v.string(),           // "book", "article", "manuscript", etc.
      language: v.string(),               // "english", "latin", "mixed", etc.
      hasFootnotes: v.boolean(),
      hasTwoColumns: v.boolean(),
      estimatedWordsPerPage: v.number(),
      recommendedChunkSize: v.number(),
      notes: v.optional(v.string()),
    })),

    // User preferences (set after analysis)
    preferences: v.optional(v.object({
      keepFrontMatter: v.boolean(),
      skipGoogleNotice: v.boolean(),
      includePageMarkers: v.boolean(),
      includeColumnMarkers: v.boolean(),
      outputFormat: v.union(v.literal("single"), v.literal("chapters")),
    })),

    // Processing progress
    chunksTotal: v.optional(v.number()),
    chunksComplete: v.optional(v.number()),
    currentChunk: v.optional(v.string()),   // e.g., "Pages 41-50"

    // Results
    outputChars: v.optional(v.number()),
    processingTimeMs: v.optional(v.number()),
    creditsUsed: v.optional(v.number()),

    // Error tracking
    errorMessage: v.optional(v.string()),
    errorChunk: v.optional(v.number()),

    // Timestamps
    createdAt: v.number(),
    analyzedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_created", ["userId", "createdAt"]),
});
