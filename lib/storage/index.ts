/**
 * Doodle Reader - Storage Layer
 *
 * Local-first storage with optional cloud sync.
 *
 * Usage:
 * ```typescript
 * import { storage } from './lib/storage';
 *
 * // Initialize once at app startup
 * await storage.init();
 *
 * // Save a document
 * const article = await storage.saveDocument({
 *   id: crypto.randomUUID(),
 *   type: 'article',
 *   title: 'My Article',
 *   // ... rest of properties
 * });
 *
 * // Query documents
 * const unread = await storage.queryDocuments({
 *   type: 'article',
 *   isRead: false,
 *   sortBy: 'pubDate',
 *   sortOrder: 'desc',
 * });
 *
 * // Export to Markdown
 * const files = await storage.exportAsMarkdown();
 * ```
 *
 * To swap storage backends (e.g., to Supabase), just change the import:
 * ```typescript
 * // import { storage } from './indexeddb-adapter';
 * import { storage } from './supabase-adapter';  // Same interface!
 * ```
 */

// Types
export type {
  // Content types
  ContentType,
  ContentStatus,
  SourceType,

  // Documents
  BaseDocument,
  Document,
  ArticleDocument,
  TranscriptDocument,
  ScanDocument,
  VideoDocument,
  NoteDocument,

  // Document properties
  ArticleProperties,
  TranscriptProperties,
  ScanProperties,
  VideoProperties,
  NewsletterProperties,
  Chapter,
  AIMetadata,

  // Feeds & Folders
  FeedSource,
  Folder,

  // Queries
  DocumentQuery,
  FeedQuery,
  StorageStats,
} from './types';

// Interface
export type {
  StorageAdapter,
  ReactiveStorageAdapter,
  SyncableStorageAdapter,
  StorageEvent,
  StorageEventType,
  StorageEventHandler,
  SearchOptions,
  SearchResult,
  SearchMatch,
  TagInfo,
  DocumentByType,
  MergeResult,
  ConflictInfo,
} from './interface';

// Markdown utilities
export { generateMarkdown, parseMarkdown } from './markdown';

// Default storage adapter (IndexedDB)
export { IndexedDBAdapter, storage } from './indexeddb-adapter';

// =============================================================================
// CONVENIENCE FACTORIES
// =============================================================================

import type {
  ArticleDocument,
  TranscriptDocument,
  ScanDocument,
  VideoDocument,
  NoteDocument,
  ArticleProperties,
  TranscriptProperties,
  ScanProperties,
  VideoProperties,
} from './types';

/**
 * Create a new article document with sensible defaults.
 */
export function createArticle(
  props: Partial<ArticleDocument> & {
    title: string;
    article: Partial<ArticleProperties> & { url: string; feedId: string; feedUrl: string; siteName: string };
  }
): ArticleDocument {
  const now = new Date().toISOString();
  return {
    id: props.id || crypto.randomUUID(),
    type: 'article',
    source: props.source || 'rss',
    title: props.title,
    created: props.created || now,
    modified: props.modified || now,
    status: props.status || 'complete',
    content: props.content || '',
    summary: props.summary,
    tags: props.tags || [],
    folderId: props.folderId,
    article: {
      url: props.article.url,
      feedId: props.article.feedId,
      feedUrl: props.article.feedUrl,
      siteName: props.article.siteName,
      author: props.article.author,
      pubDate: props.article.pubDate || now,
      wordCount: props.article.wordCount,
      readTime: props.article.readTime,
      isRead: props.article.isRead ?? false,
      isStarred: props.article.isStarred ?? false,
      excerpt: props.article.excerpt,
    },
    ai: props.ai,
  };
}

/**
 * Create a new transcript document with sensible defaults.
 */
export function createTranscript(
  props: Partial<TranscriptDocument> & {
    title: string;
    transcript: Partial<TranscriptProperties> & {
      feedUrl: string;
      feedId: string;
      podcastTitle: string;
      audioUrl: string;
      duration: number;
    };
  }
): TranscriptDocument {
  const now = new Date().toISOString();
  return {
    id: props.id || crypto.randomUUID(),
    type: 'transcript',
    source: 'podcast',
    title: props.title,
    created: props.created || now,
    modified: props.modified || now,
    status: props.status || 'complete',
    content: props.content || '',
    summary: props.summary,
    tags: props.tags || [],
    folderId: props.folderId,
    transcript: {
      feedUrl: props.transcript.feedUrl,
      feedId: props.transcript.feedId,
      podcastTitle: props.transcript.podcastTitle,
      audioUrl: props.transcript.audioUrl,
      duration: props.transcript.duration,
      pubDate: props.transcript.pubDate || now,
      episodeNumber: props.transcript.episodeNumber,
      speakers: props.transcript.speakers,
      chapters: props.transcript.chapters,
      transcriptionCost: props.transcript.transcriptionCost,
    },
    ai: props.ai,
  };
}

/**
 * Create a new scan document with sensible defaults.
 */
export function createScan(
  props: Partial<ScanDocument> & {
    title: string;
    scan: Partial<ScanProperties> & { sourceFile: string; pageCount: number };
  }
): ScanDocument {
  const now = new Date().toISOString();
  return {
    id: props.id || crypto.randomUUID(),
    type: 'scan',
    source: 'scan',
    title: props.title,
    created: props.created || now,
    modified: props.modified || now,
    status: props.status || 'complete',
    content: props.content || '',
    summary: props.summary,
    tags: props.tags || [],
    folderId: props.folderId,
    scan: {
      sourceFile: props.scan.sourceFile,
      pageCount: props.scan.pageCount,
      pageRange: props.scan.pageRange,
      parentDocumentId: props.scan.parentDocumentId,
      ocrConfidence: props.scan.ocrConfidence,
      dateScanned: props.scan.dateScanned || now,
    },
    ai: props.ai,
  };
}

/**
 * Create a new video document with sensible defaults.
 */
export function createVideo(
  props: Partial<VideoDocument> & {
    title: string;
    video: Partial<VideoProperties> & {
      videoUrl: string;
      videoId: string;
      channelName: string;
      duration: number;
    };
  }
): VideoDocument {
  const now = new Date().toISOString();
  return {
    id: props.id || crypto.randomUUID(),
    type: 'video',
    source: 'youtube',
    title: props.title,
    created: props.created || now,
    modified: props.modified || now,
    status: props.status || 'complete',
    content: props.content || '',
    summary: props.summary,
    tags: props.tags || [],
    folderId: props.folderId,
    video: {
      videoUrl: props.video.videoUrl,
      videoId: props.video.videoId,
      channelName: props.video.channelName,
      channelId: props.video.channelId,
      thumbnail: props.video.thumbnail,
      duration: props.video.duration,
      pubDate: props.video.pubDate || now,
      chapters: props.video.chapters,
    },
    ai: props.ai,
  };
}

/**
 * Create a new note document with sensible defaults.
 */
export function createNote(
  props: Partial<NoteDocument> & { title: string }
): NoteDocument {
  const now = new Date().toISOString();
  return {
    id: props.id || crypto.randomUUID(),
    type: 'note',
    source: 'manual',
    title: props.title,
    created: props.created || now,
    modified: props.modified || now,
    status: props.status || 'complete',
    content: props.content || '',
    summary: props.summary,
    tags: props.tags || [],
    folderId: props.folderId,
    ai: props.ai,
  };
}
