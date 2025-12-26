/**
 * Convex Storage Provider
 *
 * This provides a React context that wraps Convex queries/mutations
 * to provide the same API as the IndexedDB storage layer.
 *
 * The key difference: Convex is inherently reactive, so queries
 * automatically update when data changes. No need for manual subscriptions.
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import type {
  Document,
  ArticleDocument,
  TranscriptDocument,
  FeedSource,
  Folder,
  DocumentQuery,
  FeedQuery,
  StorageStats,
  ContentType,
} from './types';

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface ConvexStorageContextType {
  // State (reactive via Convex)
  documents: Document[];
  feeds: FeedSource[];
  folders: Folder[];
  stats: StorageStats | null;
  isLoading: boolean;

  // Document operations
  saveDocument: (doc: Partial<Document> & { type: ContentType; title: string }) => Promise<string>;
  deleteDocument: (id: string) => Promise<void>;
  deleteDocuments: (ids: string[]) => Promise<void>;
  markAsRead: (id: string, isRead?: boolean) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  markFeedAsRead: (feedId: string) => Promise<void>;
  updateSummary: (id: string, summary: string) => Promise<void>;
  addTags: (id: string, tags: string[]) => Promise<void>;
  removeTags: (id: string, tags: string[]) => Promise<void>;

  // Feed operations
  saveFeed: (feed: Omit<FeedSource, 'id'> & { id?: string }) => Promise<string>;
  deleteFeed: (id: string, deleteDocuments?: boolean) => Promise<void>;
  updateFeedSyncState: (id: string, state: Partial<Pick<FeedSource, 'lastFetched' | 'fetchError' | 'itemCount' | 'unreadCount'>>) => Promise<void>;

  // Folder operations
  saveFolder: (folder: Omit<Folder, 'id' | 'sortOrder'> & { id?: string }) => Promise<string>;
  deleteFolder: (id: string) => Promise<void>;
  reorderFolders: (folderIds: string[]) => Promise<void>;

  // Search
  search: (query: string, type?: ContentType) => Promise<Document[]>;

  // Utility
  queryDocuments: (query: DocumentQuery) => Document[];
  queryFeeds: (query?: FeedQuery) => FeedSource[];
  getDocument: (id: string) => Document | undefined;
  getFeed: (id: string) => FeedSource | undefined;
  getFeedByUrl: (url: string) => FeedSource | undefined;
}

const ConvexStorageContext = createContext<ConvexStorageContextType | null>(null);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export function ConvexStorageProvider({ children }: { children: React.ReactNode }) {
  // Reactive queries - these auto-update when data changes
  const rawDocuments = useQuery(api.documents.list, {}) ?? [];
  const rawFeeds = useQuery(api.feeds.list, {}) ?? [];
  const rawFolders = useQuery(api.folders.list, {}) ?? [];
  const rawStats = useQuery(api.stats.get, {});

  // Mutations
  const createDocument = useMutation(api.documents.create);
  const updateDocument = useMutation(api.documents.update);
  const removeDocument = useMutation(api.documents.remove);
  const removeDocuments = useMutation(api.documents.removeMany);
  const markAsReadMutation = useMutation(api.documents.markAsRead);
  const toggleStarMutation = useMutation(api.documents.toggleStar);
  const markFeedAsReadMutation = useMutation(api.documents.markFeedAsRead);
  const updateSummaryMutation = useMutation(api.documents.updateSummary);
  const addTagsMutation = useMutation(api.documents.addTags);
  const removeTagsMutation = useMutation(api.documents.removeTags);

  const createFeed = useMutation(api.feeds.create);
  const updateFeed = useMutation(api.feeds.update);
  const updateFeedSync = useMutation(api.feeds.updateSyncState);
  const removeFeed = useMutation(api.feeds.remove);

  const createFolder = useMutation(api.folders.create);
  const updateFolder = useMutation(api.folders.update);
  const removeFolder = useMutation(api.folders.remove);
  const reorderFoldersMutation = useMutation(api.folders.reorder);

  const searchDocuments = useMutation(api.documents.search);

  // Transform Convex documents to our Document type
  const documents = useMemo(() => {
    return rawDocuments.map((doc): Document => ({
      id: doc._id,
      type: doc.type,
      source: doc.source,
      title: doc.title,
      created: doc.created,
      modified: doc.modified,
      status: doc.status,
      content: doc.content,
      summary: doc.summary,
      tags: doc.tags,
      folderId: doc.folderId,
      ...(doc.article && { article: doc.article }),
      ...(doc.transcript && { transcript: doc.transcript }),
      ...(doc.scan && { scan: doc.scan }),
      ...(doc.video && { video: doc.video }),
      ...(doc.ai && { ai: doc.ai }),
    } as Document));
  }, [rawDocuments]);

  // Transform feeds
  const feeds = useMemo(() => {
    return rawFeeds.map((feed): FeedSource => ({
      id: feed._id,
      url: feed.url,
      siteUrl: feed.siteUrl,
      name: feed.name,
      description: feed.description,
      icon: feed.icon,
      color: feed.color,
      folderId: feed.folderId,
      feedType: feed.feedType,
      contextPrompt: feed.contextPrompt,
      lastFetched: feed.lastFetched,
      fetchError: feed.fetchError,
      itemCount: feed.itemCount,
      unreadCount: feed.unreadCount,
    }));
  }, [rawFeeds]);

  // Transform folders
  const folders = useMemo(() => {
    return rawFolders.map((folder): Folder => ({
      id: folder._id,
      name: folder.name,
      color: folder.color,
      isOpen: folder.isOpen,
      sortOrder: folder.sortOrder,
    }));
  }, [rawFolders]);

  // Stats
  const stats = useMemo((): StorageStats | null => {
    if (!rawStats) return null;
    return {
      totalDocuments: rawStats.totalDocuments,
      byType: rawStats.byType as Record<ContentType, number>,
      bySource: rawStats.bySource as Record<string, number>,
      totalFeeds: rawStats.totalFeeds,
      totalUnread: rawStats.totalUnread,
      totalStarred: rawStats.totalStarred,
    };
  }, [rawStats]);

  const isLoading = rawDocuments === undefined || rawFeeds === undefined || rawFolders === undefined;

  // Document operations
  const saveDocument = useCallback(async (doc: Partial<Document> & { type: ContentType; title: string }): Promise<string> => {
    if (doc.id) {
      // Update existing
      await updateDocument({
        id: doc.id as Id<'documents'>,
        title: doc.title,
        content: doc.content,
        status: doc.status,
        summary: doc.summary,
        tags: doc.tags,
        folderId: doc.folderId,
        article: (doc as ArticleDocument).article,
        transcript: (doc as TranscriptDocument).transcript,
        ai: doc.ai,
      });
      return doc.id;
    } else {
      // Create new
      const id = await createDocument({
        type: doc.type,
        source: doc.source || 'manual',
        title: doc.title,
        content: doc.content || '',
        status: doc.status,
        summary: doc.summary,
        tags: doc.tags,
        folderId: doc.folderId,
        article: (doc as ArticleDocument).article,
        transcript: (doc as TranscriptDocument).transcript,
        ai: doc.ai,
      });
      return id;
    }
  }, [createDocument, updateDocument]);

  const deleteDocument = useCallback(async (id: string) => {
    await removeDocument({ id: id as Id<'documents'> });
  }, [removeDocument]);

  const deleteDocuments = useCallback(async (ids: string[]) => {
    await removeDocuments({ ids: ids as Id<'documents'>[] });
  }, [removeDocuments]);

  const markAsRead = useCallback(async (id: string, isRead = true) => {
    await markAsReadMutation({ id: id as Id<'documents'>, isRead });
  }, [markAsReadMutation]);

  const toggleStar = useCallback(async (id: string) => {
    await toggleStarMutation({ id: id as Id<'documents'> });
  }, [toggleStarMutation]);

  const markFeedAsRead = useCallback(async (feedId: string) => {
    await markFeedAsReadMutation({ feedId });
  }, [markFeedAsReadMutation]);

  const updateSummary = useCallback(async (id: string, summary: string) => {
    await updateSummaryMutation({ id: id as Id<'documents'>, summary });
  }, [updateSummaryMutation]);

  const addTags = useCallback(async (id: string, tags: string[]) => {
    await addTagsMutation({ id: id as Id<'documents'>, tags });
  }, [addTagsMutation]);

  const removeTags = useCallback(async (id: string, tags: string[]) => {
    await removeTagsMutation({ id: id as Id<'documents'>, tags });
  }, [removeTagsMutation]);

  // Feed operations
  const saveFeed = useCallback(async (feed: Omit<FeedSource, 'id'> & { id?: string }): Promise<string> => {
    if (feed.id) {
      await updateFeed({
        id: feed.id as Id<'feeds'>,
        name: feed.name,
        description: feed.description,
        icon: feed.icon,
        color: feed.color,
        folderId: feed.folderId,
        contextPrompt: feed.contextPrompt,
      });
      return feed.id;
    } else {
      const id = await createFeed({
        url: feed.url,
        siteUrl: feed.siteUrl,
        name: feed.name,
        description: feed.description,
        icon: feed.icon,
        color: feed.color,
        folderId: feed.folderId,
        feedType: feed.feedType,
        contextPrompt: feed.contextPrompt,
      });
      return id;
    }
  }, [createFeed, updateFeed]);

  const deleteFeed = useCallback(async (id: string, deleteDocuments = false) => {
    await removeFeed({ id: id as Id<'feeds'>, deleteDocuments });
  }, [removeFeed]);

  const updateFeedSyncState = useCallback(async (
    id: string,
    state: Partial<Pick<FeedSource, 'lastFetched' | 'fetchError' | 'itemCount' | 'unreadCount'>>
  ) => {
    await updateFeedSync({
      id: id as Id<'feeds'>,
      ...state,
    });
  }, [updateFeedSync]);

  // Folder operations
  const saveFolder = useCallback(async (folder: Omit<Folder, 'id' | 'sortOrder'> & { id?: string }): Promise<string> => {
    if (folder.id) {
      await updateFolder({
        id: folder.id as Id<'folders'>,
        name: folder.name,
        color: folder.color,
        isOpen: folder.isOpen,
      });
      return folder.id;
    } else {
      const id = await createFolder({
        name: folder.name,
        color: folder.color,
        isOpen: folder.isOpen,
      });
      return id;
    }
  }, [createFolder, updateFolder]);

  const deleteFolder = useCallback(async (id: string) => {
    await removeFolder({ id: id as Id<'folders'> });
  }, [removeFolder]);

  const reorderFolders = useCallback(async (folderIds: string[]) => {
    await reorderFoldersMutation({ folderIds: folderIds as Id<'folders'>[] });
  }, [reorderFoldersMutation]);

  // Search
  const search = useCallback(async (query: string, type?: ContentType): Promise<Document[]> => {
    const results = await searchDocuments({ query, type, limit: 50 });
    return results.map((doc): Document => ({
      id: doc._id,
      type: doc.type,
      source: doc.source,
      title: doc.title,
      created: doc.created,
      modified: doc.modified,
      status: doc.status,
      content: doc.content,
      summary: doc.summary,
      tags: doc.tags,
      folderId: doc.folderId,
      ...(doc.article && { article: doc.article }),
      ...(doc.transcript && { transcript: doc.transcript }),
      ...(doc.scan && { scan: doc.scan }),
      ...(doc.video && { video: doc.video }),
      ...(doc.ai && { ai: doc.ai }),
    } as Document));
  }, [searchDocuments]);

  // Query helpers (filter in-memory from reactive data)
  const queryDocuments = useCallback((query: DocumentQuery): Document[] => {
    let result = [...documents];

    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      result = result.filter((d) => types.includes(d.type));
    }

    if (query.feedId) {
      result = result.filter((d) => {
        if (d.type === 'article') return (d as ArticleDocument).article.feedId === query.feedId;
        if (d.type === 'transcript') return (d as TranscriptDocument).transcript.feedId === query.feedId;
        return false;
      });
    }

    if (query.isRead !== undefined) {
      result = result.filter((d) => {
        if (d.type === 'article') return (d as ArticleDocument).article.isRead === query.isRead;
        return true;
      });
    }

    if (query.isStarred !== undefined) {
      result = result.filter((d) => {
        if (d.type === 'article') return (d as ArticleDocument).article.isStarred === query.isStarred;
        return true;
      });
    }

    // Sort
    const sortBy = query.sortBy || 'created';
    const sortOrder = query.sortOrder || 'desc';

    result.sort((a, b) => {
      const aVal = (a as any)[sortBy] || a.created;
      const bVal = (b as any)[sortBy] || b.created;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    if (query.offset) result = result.slice(query.offset);
    if (query.limit) result = result.slice(0, query.limit);

    return result;
  }, [documents]);

  const queryFeeds = useCallback((query?: FeedQuery): FeedSource[] => {
    let result = [...feeds];

    if (query?.feedType) {
      const types = Array.isArray(query.feedType) ? query.feedType : [query.feedType];
      result = result.filter((f) => types.includes(f.feedType));
    }

    if (query?.folderId) {
      result = result.filter((f) => f.folderId === query.folderId);
    }

    return result;
  }, [feeds]);

  const getDocument = useCallback((id: string): Document | undefined => {
    return documents.find((d) => d.id === id);
  }, [documents]);

  const getFeed = useCallback((id: string): FeedSource | undefined => {
    return feeds.find((f) => f.id === id);
  }, [feeds]);

  const getFeedByUrl = useCallback((url: string): FeedSource | undefined => {
    return feeds.find((f) => f.url === url);
  }, [feeds]);

  const value: ConvexStorageContextType = {
    documents,
    feeds,
    folders,
    stats,
    isLoading,
    saveDocument,
    deleteDocument,
    deleteDocuments,
    markAsRead,
    toggleStar,
    markFeedAsRead,
    updateSummary,
    addTags,
    removeTags,
    saveFeed,
    deleteFeed,
    updateFeedSyncState,
    saveFolder,
    deleteFolder,
    reorderFolders,
    search,
    queryDocuments,
    queryFeeds,
    getDocument,
    getFeed,
    getFeedByUrl,
  };

  return (
    <ConvexStorageContext.Provider value={value}>
      {children}
    </ConvexStorageContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useConvexStorage(): ConvexStorageContextType {
  const context = useContext(ConvexStorageContext);
  if (!context) {
    throw new Error('useConvexStorage must be used within a ConvexStorageProvider');
  }
  return context;
}
