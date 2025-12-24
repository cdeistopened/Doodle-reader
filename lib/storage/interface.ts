/**
 * Doodle Reader - Storage Interface
 *
 * This interface defines ALL storage operations. Any storage backend
 * (IndexedDB, File System, Supabase) must implement this interface.
 *
 * This abstraction allows us to:
 * 1. Start with IndexedDB for local-first development
 * 2. Add file system support for Markdown export/import
 * 3. Add Supabase sync when ready for cloud features
 * 4. Swap backends without changing application code
 */

import type {
  Document,
  ArticleDocument,
  TranscriptDocument,
  ScanDocument,
  VideoDocument,
  NoteDocument,
  FeedSource,
  Folder,
  DocumentQuery,
  FeedQuery,
  StorageStats,
  ContentType,
} from './types';

// =============================================================================
// STORAGE INTERFACE
// =============================================================================

export interface StorageAdapter {
  /**
   * Initialize the storage backend.
   * Must be called before any other operations.
   */
  init(): Promise<void>;

  /**
   * Check if storage is initialized and ready.
   */
  isReady(): boolean;

  /**
   * Close the storage connection (cleanup).
   */
  close(): Promise<void>;

  // ---------------------------------------------------------------------------
  // DOCUMENTS - CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Create or update a document.
   * If document.id exists, updates; otherwise creates with new ID.
   */
  saveDocument<T extends Document>(document: T): Promise<T>;

  /**
   * Get a single document by ID.
   */
  getDocument(id: string): Promise<Document | null>;

  /**
   * Get a document with type narrowing.
   */
  getDocumentByType<T extends ContentType>(
    id: string,
    type: T
  ): Promise<DocumentByType<T> | null>;

  /**
   * Query documents with filters, pagination, and sorting.
   */
  queryDocuments(query: DocumentQuery): Promise<Document[]>;

  /**
   * Count documents matching a query (for pagination).
   */
  countDocuments(query: DocumentQuery): Promise<number>;

  /**
   * Delete a document by ID.
   */
  deleteDocument(id: string): Promise<void>;

  /**
   * Bulk delete documents by IDs.
   */
  deleteDocuments(ids: string[]): Promise<void>;

  // ---------------------------------------------------------------------------
  // DOCUMENTS - Convenience Methods
  // ---------------------------------------------------------------------------

  /**
   * Mark an article/newsletter as read.
   */
  markAsRead(id: string, isRead?: boolean): Promise<void>;

  /**
   * Toggle star status.
   */
  toggleStar(id: string): Promise<void>;

  /**
   * Mark all items in a feed as read.
   */
  markFeedAsRead(feedId: string): Promise<void>;

  /**
   * Update AI-generated summary.
   */
  updateSummary(id: string, summary: string): Promise<void>;

  /**
   * Add tags to a document.
   */
  addTags(id: string, tags: string[]): Promise<void>;

  /**
   * Remove tags from a document.
   */
  removeTags(id: string, tags: string[]): Promise<void>;

  // ---------------------------------------------------------------------------
  // FEEDS - CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Add or update a feed subscription.
   */
  saveFeed(feed: FeedSource): Promise<FeedSource>;

  /**
   * Get a feed by ID.
   */
  getFeed(id: string): Promise<FeedSource | null>;

  /**
   * Get a feed by URL (for duplicate detection).
   */
  getFeedByUrl(url: string): Promise<FeedSource | null>;

  /**
   * Query feeds with filters.
   */
  queryFeeds(query?: FeedQuery): Promise<FeedSource[]>;

  /**
   * Delete a feed and optionally its documents.
   */
  deleteFeed(id: string, deleteDocuments?: boolean): Promise<void>;

  /**
   * Update feed sync state (last fetched, error, counts).
   */
  updateFeedSyncState(
    id: string,
    state: Partial<Pick<FeedSource, 'lastFetched' | 'fetchError' | 'itemCount' | 'unreadCount'>>
  ): Promise<void>;

  // ---------------------------------------------------------------------------
  // FOLDERS - CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Create or update a folder.
   */
  saveFolder(folder: Folder): Promise<Folder>;

  /**
   * Get all folders.
   */
  getFolders(): Promise<Folder[]>;

  /**
   * Delete a folder (feeds in folder become unorganized).
   */
  deleteFolder(id: string): Promise<void>;

  /**
   * Reorder folders.
   */
  reorderFolders(folderIds: string[]): Promise<void>;

  // ---------------------------------------------------------------------------
  // SEARCH & DISCOVERY
  // ---------------------------------------------------------------------------

  /**
   * Full-text search across documents.
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Get all unique tags across documents.
   */
  getAllTags(): Promise<TagInfo[]>;

  /**
   * Get storage statistics.
   */
  getStats(): Promise<StorageStats>;

  // ---------------------------------------------------------------------------
  // IMPORT / EXPORT
  // ---------------------------------------------------------------------------

  /**
   * Export documents as Markdown with Front Matter.
   * Returns a map of filename -> content.
   */
  exportAsMarkdown(query?: DocumentQuery): Promise<Map<string, string>>;

  /**
   * Import Markdown files with Front Matter.
   * Returns number of documents imported.
   */
  importFromMarkdown(files: Map<string, string>): Promise<number>;

  /**
   * Export feeds as OPML.
   */
  exportAsOPML(): Promise<string>;

  /**
   * Import feeds from OPML.
   */
  importFromOPML(opml: string): Promise<number>;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Map ContentType to Document type for type-safe queries
 */
export type DocumentByType<T extends ContentType> = T extends 'article'
  ? ArticleDocument
  : T extends 'transcript'
  ? TranscriptDocument
  : T extends 'scan'
  ? ScanDocument
  : T extends 'video'
  ? VideoDocument
  : T extends 'note'
  ? NoteDocument
  : Document;

/**
 * Search options
 */
export interface SearchOptions {
  types?: ContentType[];
  limit?: number;
  highlightMatches?: boolean;
}

/**
 * Search result with relevance info
 */
export interface SearchResult {
  document: Document;
  score: number;          // Relevance score
  matches?: SearchMatch[];
}

export interface SearchMatch {
  field: string;          // Which field matched (title, content, summary)
  snippet: string;        // Matched text with context
  positions?: number[];   // Character positions of matches
}

/**
 * Tag with usage count
 */
export interface TagInfo {
  tag: string;
  count: number;
  lastUsed: string;       // ISO date
}

// =============================================================================
// STORAGE EVENTS (for reactive UI)
// =============================================================================

export type StorageEventType =
  | 'document:created'
  | 'document:updated'
  | 'document:deleted'
  | 'feed:created'
  | 'feed:updated'
  | 'feed:deleted'
  | 'folder:created'
  | 'folder:updated'
  | 'folder:deleted'
  | 'sync:started'
  | 'sync:completed'
  | 'sync:error';

export interface StorageEvent {
  type: StorageEventType;
  payload: {
    id?: string;
    ids?: string[];
    document?: Document;
    feed?: FeedSource;
    folder?: Folder;
    error?: Error;
  };
  timestamp: string;
}

export type StorageEventHandler = (event: StorageEvent) => void;

/**
 * Extended interface for storage with event support
 */
export interface ReactiveStorageAdapter extends StorageAdapter {
  /**
   * Subscribe to storage events.
   */
  subscribe(handler: StorageEventHandler): () => void;

  /**
   * Emit an event (used internally and for sync).
   */
  emit(event: StorageEvent): void;
}

// =============================================================================
// SYNC INTERFACE (for future cloud support)
// =============================================================================

export interface SyncableStorageAdapter extends ReactiveStorageAdapter {
  /**
   * Get documents modified since a timestamp.
   */
  getModifiedSince(timestamp: string): Promise<Document[]>;

  /**
   * Get deleted document IDs since a timestamp.
   */
  getDeletedSince(timestamp: string): Promise<string[]>;

  /**
   * Merge remote changes (conflict resolution).
   */
  mergeRemoteChanges(documents: Document[]): Promise<MergeResult>;

  /**
   * Get current sync cursor/timestamp.
   */
  getSyncCursor(): Promise<string>;

  /**
   * Update sync cursor after successful sync.
   */
  setSyncCursor(cursor: string): Promise<void>;
}

export interface MergeResult {
  created: number;
  updated: number;
  conflicts: ConflictInfo[];
}

export interface ConflictInfo {
  documentId: string;
  localVersion: Document;
  remoteVersion: Document;
  resolution: 'local' | 'remote' | 'merged';
}
