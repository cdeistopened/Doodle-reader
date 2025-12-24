/**
 * Doodle Reader - IndexedDB Storage Adapter
 *
 * Local-first storage using browser IndexedDB.
 * This is the primary storage for personal use.
 *
 * Features:
 * - Fast local queries
 * - Works offline
 * - No server required
 * - ~50MB+ capacity (browser dependent)
 *
 * To swap to Supabase later, just implement StorageAdapter
 * with the same interface and swap the import.
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
  AIMetadata,
} from './types';

import type {
  StorageAdapter,
  ReactiveStorageAdapter,
  StorageEvent,
  StorageEventHandler,
  SearchOptions,
  SearchResult,
  TagInfo,
  DocumentByType,
} from './interface';

import { generateMarkdown, parseMarkdown } from './markdown';

// =============================================================================
// CONSTANTS
// =============================================================================

const DB_NAME = 'DoodleReaderDB';
const DB_VERSION = 2;  // Increment when schema changes

// Store names
const STORES = {
  DOCUMENTS: 'documents',
  FEEDS: 'feeds',
  FOLDERS: 'folders',
  DELETED: 'deleted',     // Track deletions for sync
  META: 'meta',           // App metadata (sync cursor, etc.)
} as const;

// =============================================================================
// INDEXEDDB ADAPTER
// =============================================================================

export class IndexedDBAdapter implements ReactiveStorageAdapter {
  private db: IDBDatabase | null = null;
  private eventHandlers: Set<StorageEventHandler> = new Set();
  private ready = false;

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    if (this.ready) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        this.ready = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createStores(db);
      };
    });
  }

  private createStores(db: IDBDatabase): void {
    // Documents store
    if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) {
      const docStore = db.createObjectStore(STORES.DOCUMENTS, { keyPath: 'id' });
      docStore.createIndex('type', 'type', { unique: false });
      docStore.createIndex('source', 'source', { unique: false });
      docStore.createIndex('status', 'status', { unique: false });
      docStore.createIndex('created', 'created', { unique: false });
      docStore.createIndex('modified', 'modified', { unique: false });
      docStore.createIndex('feedId', 'article.feedId', { unique: false });
      docStore.createIndex('isRead', 'article.isRead', { unique: false });
      docStore.createIndex('isStarred', 'article.isStarred', { unique: false });
      docStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
    }

    // Feeds store
    if (!db.objectStoreNames.contains(STORES.FEEDS)) {
      const feedStore = db.createObjectStore(STORES.FEEDS, { keyPath: 'id' });
      feedStore.createIndex('url', 'url', { unique: true });
      feedStore.createIndex('feedType', 'feedType', { unique: false });
      feedStore.createIndex('folderId', 'folderId', { unique: false });
    }

    // Folders store
    if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
      const folderStore = db.createObjectStore(STORES.FOLDERS, { keyPath: 'id' });
      folderStore.createIndex('sortOrder', 'sortOrder', { unique: false });
    }

    // Deleted tracking (for sync)
    if (!db.objectStoreNames.contains(STORES.DELETED)) {
      const deletedStore = db.createObjectStore(STORES.DELETED, { keyPath: 'id' });
      deletedStore.createIndex('deletedAt', 'deletedAt', { unique: false });
    }

    // Metadata store
    if (!db.objectStoreNames.contains(STORES.META)) {
      db.createObjectStore(STORES.META, { keyPath: 'key' });
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.ready = false;
    }
  }

  // ---------------------------------------------------------------------------
  // EVENT HANDLING
  // ---------------------------------------------------------------------------

  subscribe(handler: StorageEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  emit(event: StorageEvent): void {
    this.eventHandlers.forEach((handler) => handler(event));
  }

  // ---------------------------------------------------------------------------
  // DOCUMENTS - CRUD
  // ---------------------------------------------------------------------------

  async saveDocument<T extends Document>(document: T): Promise<T> {
    this.ensureReady();

    const isNew = !(await this.getDocument(document.id));
    const now = new Date().toISOString();

    const doc: T = {
      ...document,
      modified: now,
      created: isNew ? now : document.created,
    };

    await this.put(STORES.DOCUMENTS, doc);

    this.emit({
      type: isNew ? 'document:created' : 'document:updated',
      payload: { id: doc.id, document: doc },
      timestamp: now,
    });

    return doc;
  }

  async getDocument(id: string): Promise<Document | null> {
    this.ensureReady();
    return this.get(STORES.DOCUMENTS, id);
  }

  async getDocumentByType<T extends ContentType>(
    id: string,
    type: T
  ): Promise<DocumentByType<T> | null> {
    const doc = await this.getDocument(id);
    if (doc && doc.type === type) {
      return doc as DocumentByType<T>;
    }
    return null;
  }

  async queryDocuments(query: DocumentQuery): Promise<Document[]> {
    this.ensureReady();

    // Get all documents and filter in memory
    // For a production app with 10k+ docs, we'd use cursor-based filtering
    const all = await this.getAll<Document>(STORES.DOCUMENTS);

    let results = all;

    // Apply filters
    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      results = results.filter((d) => types.includes(d.type));
    }

    if (query.source) {
      const sources = Array.isArray(query.source) ? query.source : [query.source];
      results = results.filter((d) => sources.includes(d.source));
    }

    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      results = results.filter((d) => statuses.includes(d.status));
    }

    if (query.feedId) {
      results = results.filter((d) => {
        if (d.type === 'article') return (d as ArticleDocument).article.feedId === query.feedId;
        if (d.type === 'transcript') return (d as TranscriptDocument).transcript.feedId === query.feedId;
        return false;
      });
    }

    if (query.folderId) {
      results = results.filter((d) => d.folderId === query.folderId);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter((d) =>
        query.tags!.some((tag) => d.tags.includes(tag))
      );
    }

    if (query.isRead !== undefined) {
      results = results.filter((d) => {
        if (d.type === 'article') return (d as ArticleDocument).article.isRead === query.isRead;
        return true;
      });
    }

    if (query.isStarred !== undefined) {
      results = results.filter((d) => {
        if (d.type === 'article') return (d as ArticleDocument).article.isStarred === query.isStarred;
        return true;
      });
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      results = results.filter(
        (d) =>
          d.title.toLowerCase().includes(searchLower) ||
          d.content.toLowerCase().includes(searchLower) ||
          d.summary?.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    const sortBy = query.sortBy || 'created';
    const sortOrder = query.sortOrder || 'desc';

    results.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortBy) {
        case 'title':
          aVal = a.title;
          bVal = b.title;
          break;
        case 'modified':
          aVal = a.modified;
          bVal = b.modified;
          break;
        case 'pubDate':
          aVal = this.getPubDate(a);
          bVal = this.getPubDate(b);
          break;
        case 'created':
        default:
          aVal = a.created;
          bVal = b.created;
      }

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  private getPubDate(doc: Document): string {
    switch (doc.type) {
      case 'article':
        return (doc as ArticleDocument).article.pubDate;
      case 'transcript':
        return (doc as TranscriptDocument).transcript.pubDate;
      case 'video':
        return (doc as VideoDocument).video.pubDate;
      default:
        return doc.created;
    }
  }

  async countDocuments(query: DocumentQuery): Promise<number> {
    const docs = await this.queryDocuments({ ...query, limit: undefined, offset: undefined });
    return docs.length;
  }

  async deleteDocument(id: string): Promise<void> {
    this.ensureReady();

    const doc = await this.getDocument(id);
    if (!doc) return;

    await this.delete(STORES.DOCUMENTS, id);

    // Track deletion for sync
    await this.put(STORES.DELETED, {
      id,
      type: 'document',
      deletedAt: new Date().toISOString(),
    });

    this.emit({
      type: 'document:deleted',
      payload: { id },
      timestamp: new Date().toISOString(),
    });
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteDocument(id);
    }
  }

  // ---------------------------------------------------------------------------
  // DOCUMENTS - Convenience Methods
  // ---------------------------------------------------------------------------

  async markAsRead(id: string, isRead = true): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc || doc.type !== 'article') return;

    const articleDoc = doc as ArticleDocument;
    articleDoc.article.isRead = isRead;
    await this.saveDocument(articleDoc);
  }

  async toggleStar(id: string): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc || doc.type !== 'article') return;

    const articleDoc = doc as ArticleDocument;
    articleDoc.article.isStarred = !articleDoc.article.isStarred;
    await this.saveDocument(articleDoc);
  }

  async markFeedAsRead(feedId: string): Promise<void> {
    const docs = await this.queryDocuments({
      feedId,
      isRead: false,
    });

    for (const doc of docs) {
      if (doc.type === 'article') {
        (doc as ArticleDocument).article.isRead = true;
        await this.saveDocument(doc);
      }
    }
  }

  async updateSummary(id: string, summary: string): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc) return;

    doc.summary = summary;
    await this.saveDocument(doc);
  }

  async updateTranscriptionStatus(
    id: string,
    status: 'none' | 'pending' | 'processing' | 'complete' | 'error',
    transcript?: string
  ): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc || doc.type !== 'article') return;

    const articleDoc = doc as ArticleDocument;
    const extendedProps = articleDoc.article as any;
    extendedProps.transcriptionStatus = status;

    // If transcript provided, store it in the content
    if (transcript && status === 'complete') {
      articleDoc.content = transcript;
      articleDoc.summary = transcript.substring(0, 500) + '...';
    }

    await this.saveDocument(articleDoc);
  }

  async addTags(id: string, tags: string[]): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc) return;

    const newTags = [...new Set([...doc.tags, ...tags])];
    doc.tags = newTags;
    await this.saveDocument(doc);
  }

  async removeTags(id: string, tags: string[]): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc) return;

    doc.tags = doc.tags.filter((t) => !tags.includes(t));
    await this.saveDocument(doc);
  }

  // ---------------------------------------------------------------------------
  // FEEDS
  // ---------------------------------------------------------------------------

  async saveFeed(feed: FeedSource): Promise<FeedSource> {
    this.ensureReady();

    const existing = await this.getFeed(feed.id);
    const isNew = !existing;

    await this.put(STORES.FEEDS, feed);

    this.emit({
      type: isNew ? 'feed:created' : 'feed:updated',
      payload: { id: feed.id, feed },
      timestamp: new Date().toISOString(),
    });

    return feed;
  }

  async getFeed(id: string): Promise<FeedSource | null> {
    this.ensureReady();
    return this.get(STORES.FEEDS, id);
  }

  async getFeedByUrl(url: string): Promise<FeedSource | null> {
    this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.FEEDS], 'readonly');
      const store = tx.objectStore(STORES.FEEDS);
      const index = store.index('url');
      const request = index.get(url);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async queryFeeds(query?: FeedQuery): Promise<FeedSource[]> {
    this.ensureReady();

    let feeds = await this.getAll<FeedSource>(STORES.FEEDS);

    if (query?.feedType) {
      const types = Array.isArray(query.feedType) ? query.feedType : [query.feedType];
      feeds = feeds.filter((f) => types.includes(f.feedType));
    }

    if (query?.folderId) {
      feeds = feeds.filter((f) => f.folderId === query.folderId);
    }

    if (query?.hasUnread !== undefined) {
      feeds = feeds.filter((f) =>
        query.hasUnread ? (f.unreadCount || 0) > 0 : (f.unreadCount || 0) === 0
      );
    }

    return feeds.sort((a, b) => a.name.localeCompare(b.name));
  }

  async deleteFeed(id: string, deleteDocuments = false): Promise<void> {
    this.ensureReady();

    if (deleteDocuments) {
      const docs = await this.queryDocuments({ feedId: id });
      await this.deleteDocuments(docs.map((d) => d.id));
    }

    await this.delete(STORES.FEEDS, id);

    await this.put(STORES.DELETED, {
      id,
      type: 'feed',
      deletedAt: new Date().toISOString(),
    });

    this.emit({
      type: 'feed:deleted',
      payload: { id },
      timestamp: new Date().toISOString(),
    });
  }

  async updateFeedSyncState(
    id: string,
    state: Partial<Pick<FeedSource, 'lastFetched' | 'fetchError' | 'itemCount' | 'unreadCount'>>
  ): Promise<void> {
    const feed = await this.getFeed(id);
    if (!feed) return;

    await this.saveFeed({ ...feed, ...state });
  }

  // ---------------------------------------------------------------------------
  // FOLDERS
  // ---------------------------------------------------------------------------

  async saveFolder(folder: Folder): Promise<Folder> {
    this.ensureReady();

    const existing = await this.get<Folder>(STORES.FOLDERS, folder.id);
    const isNew = !existing;

    await this.put(STORES.FOLDERS, folder);

    this.emit({
      type: isNew ? 'folder:created' : 'folder:updated',
      payload: { id: folder.id, folder },
      timestamp: new Date().toISOString(),
    });

    return folder;
  }

  async getFolders(): Promise<Folder[]> {
    this.ensureReady();
    const folders = await this.getAll<Folder>(STORES.FOLDERS);
    return folders.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async deleteFolder(id: string): Promise<void> {
    this.ensureReady();

    // Unset folderId on feeds in this folder
    const feeds = await this.queryFeeds({ folderId: id });
    for (const feed of feeds) {
      delete feed.folderId;
      await this.saveFeed(feed);
    }

    await this.delete(STORES.FOLDERS, id);

    this.emit({
      type: 'folder:deleted',
      payload: { id },
      timestamp: new Date().toISOString(),
    });
  }

  async reorderFolders(folderIds: string[]): Promise<void> {
    for (let i = 0; i < folderIds.length; i++) {
      const folder = await this.get<Folder>(STORES.FOLDERS, folderIds[i]);
      if (folder) {
        folder.sortOrder = i;
        await this.saveFolder(folder);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SEARCH & DISCOVERY
  // ---------------------------------------------------------------------------

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const docs = await this.queryDocuments({
      type: options?.types,
      search: query,
      limit: options?.limit || 50,
    });

    return docs.map((doc) => ({
      document: doc,
      score: this.calculateSearchScore(doc, query),
      matches: options?.highlightMatches ? this.findMatches(doc, query) : undefined,
    }));
  }

  private calculateSearchScore(doc: Document, query: string): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Title match is worth more
    if (doc.title.toLowerCase().includes(queryLower)) {
      score += 10;
      if (doc.title.toLowerCase().startsWith(queryLower)) {
        score += 5;
      }
    }

    // Summary match
    if (doc.summary?.toLowerCase().includes(queryLower)) {
      score += 5;
    }

    // Content match
    if (doc.content.toLowerCase().includes(queryLower)) {
      score += 1;
    }

    // Tag exact match
    if (doc.tags.some((t) => t.toLowerCase() === queryLower)) {
      score += 8;
    }

    return score;
  }

  private findMatches(doc: Document, query: string): { field: string; snippet: string }[] {
    const matches: { field: string; snippet: string }[] = [];
    const queryLower = query.toLowerCase();

    const findSnippet = (text: string, field: string) => {
      const idx = text.toLowerCase().indexOf(queryLower);
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + query.length + 40);
        matches.push({
          field,
          snippet: (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : ''),
        });
      }
    };

    findSnippet(doc.title, 'title');
    if (doc.summary) findSnippet(doc.summary, 'summary');
    findSnippet(doc.content, 'content');

    return matches;
  }

  async getAllTags(): Promise<TagInfo[]> {
    const docs = await this.getAll<Document>(STORES.DOCUMENTS);

    const tagMap = new Map<string, { count: number; lastUsed: string }>();

    for (const doc of docs) {
      for (const tag of doc.tags) {
        const existing = tagMap.get(tag);
        if (!existing || doc.modified > existing.lastUsed) {
          tagMap.set(tag, {
            count: (existing?.count || 0) + 1,
            lastUsed: doc.modified,
          });
        } else {
          existing.count++;
        }
      }
    }

    return Array.from(tagMap.entries())
      .map(([tag, info]) => ({ tag, ...info }))
      .sort((a, b) => b.count - a.count);
  }

  async getStats(): Promise<StorageStats> {
    const docs = await this.getAll<Document>(STORES.DOCUMENTS);
    const feeds = await this.getAll<FeedSource>(STORES.FEEDS);

    const byType: Record<ContentType, number> = {
      article: 0,
      transcript: 0,
      scan: 0,
      video: 0,
      note: 0,
    };

    const bySource: Record<string, number> = {};
    let totalUnread = 0;
    let totalStarred = 0;

    for (const doc of docs) {
      byType[doc.type]++;
      bySource[doc.source] = (bySource[doc.source] || 0) + 1;

      if (doc.type === 'article') {
        const article = doc as ArticleDocument;
        if (!article.article.isRead) totalUnread++;
        if (article.article.isStarred) totalStarred++;
      }
    }

    return {
      totalDocuments: docs.length,
      byType,
      bySource: bySource as Record<string, number>,
      totalFeeds: feeds.length,
      totalUnread,
      totalStarred,
    };
  }

  // ---------------------------------------------------------------------------
  // IMPORT / EXPORT
  // ---------------------------------------------------------------------------

  async exportAsMarkdown(query?: DocumentQuery): Promise<Map<string, string>> {
    const docs = await this.queryDocuments(query || {});
    const result = new Map<string, string>();

    for (const doc of docs) {
      const filename = this.generateFilename(doc);
      const markdown = generateMarkdown(doc);
      result.set(filename, markdown);
    }

    return result;
  }

  private generateFilename(doc: Document): string {
    const date = doc.created.split('T')[0];
    const slug = doc.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    return `${date}-${slug}.md`;
  }

  async importFromMarkdown(files: Map<string, string>): Promise<number> {
    let imported = 0;

    for (const [, content] of files) {
      const doc = parseMarkdown(content);
      if (doc) {
        await this.saveDocument(doc);
        imported++;
      }
    }

    return imported;
  }

  async exportAsOPML(): Promise<string> {
    const feeds = await this.queryFeeds();
    const folders = await this.getFolders();

    const folderMap = new Map(folders.map((f) => [f.id, f]));

    let opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Doodle Reader Feeds</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
  </head>
  <body>
`;

    // Group feeds by folder
    const byFolder = new Map<string | undefined, FeedSource[]>();
    for (const feed of feeds) {
      const key = feed.folderId;
      if (!byFolder.has(key)) {
        byFolder.set(key, []);
      }
      byFolder.get(key)!.push(feed);
    }

    // Unorganized feeds first
    const unorganized = byFolder.get(undefined) || [];
    for (const feed of unorganized) {
      opml += `    <outline type="rss" text="${this.escapeXml(feed.name)}" xmlUrl="${this.escapeXml(feed.url)}" htmlUrl="${this.escapeXml(feed.siteUrl)}"/>\n`;
    }

    // Folders with feeds
    for (const [folderId, folderFeeds] of byFolder) {
      if (!folderId) continue;
      const folder = folderMap.get(folderId);
      if (!folder) continue;

      opml += `    <outline text="${this.escapeXml(folder.name)}">\n`;
      for (const feed of folderFeeds) {
        opml += `      <outline type="rss" text="${this.escapeXml(feed.name)}" xmlUrl="${this.escapeXml(feed.url)}" htmlUrl="${this.escapeXml(feed.siteUrl)}"/>\n`;
      }
      opml += `    </outline>\n`;
    }

    opml += `  </body>
</opml>`;

    return opml;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async importFromOPML(opml: string): Promise<number> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(opml, 'text/xml');
    const outlines = doc.querySelectorAll('outline[xmlUrl]');

    let imported = 0;

    for (const outline of outlines) {
      const url = outline.getAttribute('xmlUrl');
      const name = outline.getAttribute('text') || outline.getAttribute('title') || url;
      const siteUrl = outline.getAttribute('htmlUrl') || '';

      if (!url) continue;

      // Check for duplicate
      const existing = await this.getFeedByUrl(url);
      if (existing) continue;

      // Get folder from parent
      const parent = outline.parentElement;
      let folderId: string | undefined;

      if (parent?.tagName === 'outline' && !parent.hasAttribute('xmlUrl')) {
        const folderName = parent.getAttribute('text') || 'Imported';
        const folders = await this.getFolders();
        let folder = folders.find((f) => f.name === folderName);

        if (!folder) {
          folder = {
            id: crypto.randomUUID(),
            name: folderName,
            isOpen: true,
            sortOrder: folders.length,
          };
          await this.saveFolder(folder);
        }

        folderId = folder.id;
      }

      const feed: FeedSource = {
        id: crypto.randomUUID(),
        url,
        siteUrl,
        name: name!,
        feedType: 'rss',
        folderId,
      };

      await this.saveFeed(feed);
      imported++;
    }

    return imported;
  }

  // ---------------------------------------------------------------------------
  // LOW-LEVEL HELPERS
  // ---------------------------------------------------------------------------

  private ensureReady(): void {
    if (!this.ready || !this.db) {
      throw new Error('Storage not initialized. Call init() first.');
    }
  }

  private async get<T>(storeName: string, id: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async put<T>(storeName: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(value);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async delete(storeName: string, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const storage = new IndexedDBAdapter();
