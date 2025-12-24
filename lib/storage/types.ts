/**
 * Doodle Reader - Unified Storage Types
 *
 * These types define the data model for all content in Doodle Reader.
 * The storage layer is abstracted so we can swap between:
 * - IndexedDB (browser, local-first)
 * - File System (Node.js/Electron, Markdown files)
 * - Supabase/Cloud (when ready for sync)
 */

// =============================================================================
// CONTENT TYPES
// =============================================================================

/**
 * All content types supported by Doodle Reader.
 * Each type has specific Front Matter properties.
 */
export type ContentType = 'article' | 'transcript' | 'scan' | 'video' | 'note';

/**
 * Processing status for async content (transcription, OCR, etc.)
 */
export type ContentStatus = 'draft' | 'processing' | 'complete' | 'error' | 'archived';

/**
 * Source of the content - determines which conditional properties apply
 */
export type SourceType = 'rss' | 'podcast' | 'youtube' | 'scan' | 'manual' | 'newsletter';

// =============================================================================
// BASE DOCUMENT (Universal Properties)
// =============================================================================

/**
 * Properties that exist on ALL documents regardless of type.
 * This is the minimum viable document.
 */
export interface BaseDocument {
  // Identity
  id: string;
  type: ContentType;

  // Core metadata
  title: string;
  created: string;      // ISO date
  modified: string;     // ISO date
  status: ContentStatus;

  // Content
  content: string;      // Markdown body
  summary?: string;     // AI-generated or manual summary for discovery

  // Organization
  tags: string[];
  folderId?: string;

  // Source tracking
  source: SourceType;
}

// =============================================================================
// SOURCE-SPECIFIC PROPERTIES (Conditional)
// =============================================================================

/**
 * Properties for RSS/blog articles
 */
export interface ArticleProperties {
  url: string;            // Original article URL
  feedId: string;         // Reference to the feed
  feedUrl: string;        // RSS feed URL
  siteName: string;       // Blog/site name
  author?: string;
  pubDate: string;        // Original publication date
  wordCount?: number;
  readTime?: number;      // Estimated minutes
  isRead: boolean;
  isStarred: boolean;
  excerpt?: string;       // First paragraph or manual excerpt
}

/**
 * Properties for podcast transcripts
 */
export interface TranscriptProperties {
  feedUrl: string;
  feedId: string;
  podcastTitle: string;
  audioUrl: string;
  duration: number;       // Seconds
  pubDate: string;
  episodeNumber?: number;
  speakers?: string[];
  chapters?: Chapter[];
  transcriptionCost?: number;  // USD
}

export interface Chapter {
  start: number;          // Seconds
  end: number;
  title: string;
  summary?: string;
}

/**
 * Properties for scanned documents (OCR)
 */
export interface ScanProperties {
  sourceFile: string;     // Original PDF filename
  pageCount: number;
  pageRange?: string;     // e.g., "1-50" for partial scans
  parentDocumentId?: string;  // For multi-part books
  ocrConfidence?: number; // 0-1
  dateScanned: string;
}

/**
 * Properties for YouTube videos
 */
export interface VideoProperties {
  videoUrl: string;
  videoId: string;
  channelName: string;
  channelId?: string;
  thumbnail?: string;
  duration: number;       // Seconds
  pubDate: string;
  chapters?: Chapter[];
}

/**
 * Properties for newsletters
 */
export interface NewsletterProperties {
  emailSubject: string;
  senderEmail: string;
  senderName: string;
  receivedDate: string;
  isRead: boolean;
  isStarred: boolean;
}

// =============================================================================
// AI/PROCESSING METADATA
// =============================================================================

/**
 * AI-generated metadata for discovery and RAG
 */
export interface AIMetadata {
  embeddingsGenerated?: boolean;
  summaryModel?: string;        // Which model generated the summary
  topicsExtracted?: string[];   // Auto-detected topics
  qualityScore?: number;        // 0-1, for RAG prioritization
  lastProcessed?: string;       // ISO date of last AI processing
}

// =============================================================================
// COMPOSITE DOCUMENT TYPES
// =============================================================================

/**
 * Full article document (RSS/blog content)
 */
export interface ArticleDocument extends BaseDocument {
  type: 'article';
  source: 'rss' | 'newsletter';
  article: ArticleProperties;
  ai?: AIMetadata;
}

/**
 * Full transcript document (podcast/audio)
 */
export interface TranscriptDocument extends BaseDocument {
  type: 'transcript';
  source: 'podcast';
  transcript: TranscriptProperties;
  ai?: AIMetadata;
}

/**
 * Full scan document (OCR'd PDF)
 */
export interface ScanDocument extends BaseDocument {
  type: 'scan';
  source: 'scan';
  scan: ScanProperties;
  ai?: AIMetadata;
}

/**
 * Full video document (YouTube transcript)
 */
export interface VideoDocument extends BaseDocument {
  type: 'video';
  source: 'youtube';
  video: VideoProperties;
  ai?: AIMetadata;
}

/**
 * Manual note (user-created)
 */
export interface NoteDocument extends BaseDocument {
  type: 'note';
  source: 'manual';
  ai?: AIMetadata;
}

/**
 * Union type for any document
 */
export type Document =
  | ArticleDocument
  | TranscriptDocument
  | ScanDocument
  | VideoDocument
  | NoteDocument;

// =============================================================================
// FEED SOURCES
// =============================================================================

/**
 * RSS/Podcast feed subscription
 */
export interface FeedSource {
  id: string;
  url: string;            // RSS feed URL
  siteUrl: string;        // Website URL
  name: string;
  description?: string;
  icon?: string;          // Favicon URL
  color?: string;         // Fallback color for UI
  folderId?: string;

  // Feed type
  feedType: 'rss' | 'podcast' | 'youtube' | 'newsletter';

  // Transcript polishing context (for podcasts)
  contextPrompt?: string; // Show-specific context: hosts, guests, proper nouns, etc.

  // Sync state
  lastFetched?: string;   // ISO date
  fetchError?: string;
  itemCount?: number;
  unreadCount?: number;
}

/**
 * Folder for organizing feeds
 */
export interface Folder {
  id: string;
  name: string;
  color?: string;
  isOpen: boolean;        // UI state - expanded/collapsed
  sortOrder: number;
}

// =============================================================================
// QUERY & FILTER TYPES
// =============================================================================

export interface DocumentQuery {
  type?: ContentType | ContentType[];
  source?: SourceType | SourceType[];
  status?: ContentStatus | ContentStatus[];
  feedId?: string;
  folderId?: string;
  tags?: string[];        // Match any of these tags
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;        // Full-text search

  // Pagination
  limit?: number;
  offset?: number;

  // Sorting
  sortBy?: 'created' | 'modified' | 'pubDate' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface FeedQuery {
  feedType?: FeedSource['feedType'] | FeedSource['feedType'][];
  folderId?: string;
  hasUnread?: boolean;
}

// =============================================================================
// STORAGE STATISTICS
// =============================================================================

export interface StorageStats {
  totalDocuments: number;
  byType: Record<ContentType, number>;
  bySource: Record<SourceType, number>;
  totalFeeds: number;
  totalUnread: number;
  totalStarred: number;
  storageUsedBytes?: number;  // If available
}
