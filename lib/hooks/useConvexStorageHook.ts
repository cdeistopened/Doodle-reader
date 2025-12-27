/**
 * Doodle Reader - useConvexStorageHook
 *
 * React hook that provides the same API as useStorage but uses Convex
 * for persistence instead of IndexedDB.
 *
 * This hook wraps the ConvexStorageProvider context and adds all the
 * business logic (RSS fetching, transcription, etc.) that the UI needs.
 */

import { useState, useCallback, useMemo } from 'react';
import { useConvexStorage } from '../storage/convex-provider';
import type {
  Document,
  ArticleDocument,
  FeedSource,
  Folder,
  DocumentQuery,
  StorageStats,
} from '../storage';
import {
  convertFeedSource,
  convertFeedItems,
  toOldFeedItem,
  toOldFeedSource,
} from '../storage/adapters';
import type { FeedItem, FeedSource as OldFeedSource } from '../../types';
import { fetchFeed } from '../rss';
import { transcribeAudio, hasApiKey, setApiKey, type TranscriptionProgress } from '../transcribe';
import { transcribeAudioWithGemini, hasGeminiApiKey } from '../transcribeGemini';
import { polishTranscript, hasGeminiKey } from '../polish';
import { getTranscript } from '../youtube';

export type TranscriptionProvider = 'assemblyai' | 'gemini';

interface UseStorageReturn {
  // State
  items: FeedItem[];
  feeds: OldFeedSource[];
  folders: Folder[];
  loading: boolean;
  error: string | null;
  stats: StorageStats | null;

  // Actions
  subscribe: (url: string, onProgress?: (count: number) => void) => Promise<void>;
  unsubscribe: (feedId: string, deleteItems?: boolean) => Promise<void>;
  refreshFeeds: () => Promise<void>;
  refreshFeed: (feedId: string) => Promise<void>;
  markAsRead: (itemId: string, isRead?: boolean) => Promise<void>;
  toggleStar: (itemId: string) => Promise<void>;
  markAllRead: (feedId?: string) => Promise<void>;
  updateSummary: (itemId: string, summary: string) => Promise<void>;

  // Transcription
  transcribeItem: (itemId: string, onProgress?: (progress: TranscriptionProgress) => void, provider?: TranscriptionProvider) => Promise<void>;
  transcribeBatch: (
    itemIds: string[],
    onBatchProgress?: (progress: { completed: number; total: number; currentTitle?: string }) => void,
    provider?: TranscriptionProvider
  ) => Promise<{ succeeded: number; failed: number }>;
  hasTranscriptionKey: (provider?: TranscriptionProvider) => boolean;
  setTranscriptionKey: (key: string) => void;

  // Folders
  createFolder: (name: string) => Promise<Folder>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveFeedToFolder: (feedId: string, folderId: string | undefined) => Promise<void>;

  // Query
  queryItems: (query: DocumentQuery) => Promise<FeedItem[]>;
  searchItems: (query: string) => Promise<FeedItem[]>;

  // Export
  exportToMarkdown: () => Promise<Map<string, string>>;
  exportToOPML: () => Promise<string>;
  importFromOPML: (opml: string) => Promise<number>;

  // Scanned Documents
  saveScannedDocument: (title: string, content: string, metadata: {
    pageCount: number;
    fileSizeMB: number;
    processingTimeMs: number;
  }) => Promise<void>;
  documentCount: number;

  // One-off video import
  importVideo: (url: string) => Promise<void>;
}

export function useConvexStorageHook(): UseStorageReturn {
  const convex = useConvexStorage();
  const [error, setError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  // Transform Convex data to the old FeedItem/FeedSource types for UI compatibility
  const items = useMemo(() => {
    return convex.documents
      .filter((d): d is ArticleDocument => d.type === 'article')
      .map(toOldFeedItem)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [convex.documents]);

  const feeds = useMemo(() => {
    return convex.feeds.map(toOldFeedSource);
  }, [convex.feeds]);

  const loading = convex.isLoading || localLoading;

  // Subscribe to a new feed
  const subscribe = useCallback(async (url: string, onProgress?: (count: number) => void) => {
    setLocalLoading(true);
    setError(null);
    try {
      const { source, items: newItems } = await fetchFeed(url);

      // Check for duplicate
      const existing = convex.getFeedByUrl(source.url);
      if (existing) {
        throw new Error('Already subscribed to this feed');
      }

      // Convert and save feed (strip id so Convex generates its own)
      const { id: _oldId, ...newFeedWithoutId } = convertFeedSource(source);
      const feedId = await convex.saveFeed(newFeedWithoutId);

      // Convert and save items with progress updates
      // Use Convex-generated feedId instead of the local one
      const docs = convertFeedItems(newItems, source.url, source.name);
      let savedCount = 0;
      for (const doc of docs) {
        // Strip the local id and update feedId to Convex-generated one
        const { id: _localId, ...docWithoutId } = doc;
        const docWithConvexFeedId = {
          ...docWithoutId,
          article: {
            ...docWithoutId.article,
            feedId: feedId,  // Use Convex-generated feedId
          },
        };
        await convex.saveDocument(docWithConvexFeedId as typeof doc);
        savedCount++;
        if (onProgress) {
          onProgress(savedCount);
        }
      }

      // Update feed counts
      await convex.updateFeedSyncState(feedId, {
        lastFetched: new Date().toISOString(),
        itemCount: docs.length,
        unreadCount: docs.length,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to subscribe';
      setError(msg);
      throw e;
    } finally {
      setLocalLoading(false);
    }
  }, [convex]);

  // Unsubscribe from a feed
  const unsubscribe = useCallback(async (feedId: string, deleteItems = true) => {
    await convex.deleteFeed(feedId, deleteItems);
  }, [convex]);

  // Refresh all feeds
  const refreshFeeds = useCallback(async () => {
    setLocalLoading(true);
    setError(null);
    try {
      for (const feed of convex.feeds) {
        try {
          await refreshSingleFeed(feed);
        } catch (e) {
          console.warn(`Failed to refresh ${feed.name}:`, e);
          await convex.updateFeedSyncState(feed.id, {
            fetchError: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
    } finally {
      setLocalLoading(false);
    }
  }, [convex]);

  // Refresh a single feed
  const refreshFeed = useCallback(async (feedId: string) => {
    const feed = convex.getFeed(feedId);
    if (!feed) return;
    await refreshSingleFeed(feed);
  }, [convex]);

  const refreshSingleFeed = async (feed: FeedSource) => {
    const { items: newItems } = await fetchFeed(feed.url);
    const docs = convertFeedItems(newItems, feed.url, feed.name);

    let newCount = 0;
    for (const doc of docs) {
      // Check if item with this URL already exists (use URL as unique key)
      const existingDoc = convex.documents.find(
        (d) => d.type === 'article' && (d as ArticleDocument).article.url === doc.article.url
      );
      if (!existingDoc) {
        // Strip the local id and use Convex-generated feedId
        const { id: _localId, ...docWithoutId } = doc;
        const docWithConvexFeedId = {
          ...docWithoutId,
          article: {
            ...docWithoutId.article,
            feedId: feed.id,  // Use existing Convex feedId
          },
        };
        await convex.saveDocument(docWithConvexFeedId as typeof doc);
        newCount++;
      }
    }

    // Update feed state
    const allFeedDocs = convex.queryDocuments({ feedId: feed.id });
    const unreadCount = allFeedDocs.filter((d) => {
      if (d.type === 'article') {
        return !(d as ArticleDocument).article.isRead;
      }
      return false;
    }).length;

    await convex.updateFeedSyncState(feed.id, {
      lastFetched: new Date().toISOString(),
      itemCount: allFeedDocs.length,
      unreadCount,
      fetchError: undefined,
    });
  };

  // Mark item as read
  const markAsRead = useCallback(async (itemId: string, isRead = true) => {
    await convex.markAsRead(itemId, isRead);
  }, [convex]);

  // Toggle star
  const toggleStar = useCallback(async (itemId: string) => {
    await convex.toggleStar(itemId);
  }, [convex]);

  // Mark all as read
  const markAllRead = useCallback(async (feedId?: string) => {
    if (feedId) {
      await convex.markFeedAsRead(feedId);
    } else {
      // Mark all articles as read
      const unreadDocs = convex.documents.filter(
        (d) => d.type === 'article' && !(d as ArticleDocument).article.isRead
      );
      for (const doc of unreadDocs) {
        await convex.markAsRead(doc.id, true);
      }
    }
  }, [convex]);

  // Update summary
  const updateSummary = useCallback(async (itemId: string, summary: string) => {
    await convex.updateSummary(itemId, summary);
  }, [convex]);

  // Transcription
  const transcribeItem = useCallback(async (
    itemId: string,
    onProgress?: (progress: TranscriptionProgress) => void,
    provider: TranscriptionProvider = 'assemblyai'
  ) => {
    const item = items.find(i => i.id === itemId);
    if (!item || !item.audioUrl) {
      throw new Error('Item not found or has no audio URL');
    }

    // Get feed context for polishing
    const feed = feeds.find(f => f.id === item.feedId);
    const contextPrompt = feed?.contextPrompt;

    // Get current document
    const doc = convex.getDocument(itemId) as ArticleDocument | undefined;
    if (!doc) throw new Error('Document not found');

    // Use 'any' for extended article props (same pattern as adapters.ts)
    const extendedArticle = doc.article as any;

    try {
      // Update status to processing
      await convex.saveDocument({
        ...doc,
        article: { ...extendedArticle, transcriptionStatus: 'processing' },
      } as ArticleDocument);

      let finalContent: string;

      if (provider === 'gemini') {
        // Use Gemini for transcription
        onProgress?.({ status: 'processing', message: 'Transcribing with Gemini...' });
        const result = await transcribeAudioWithGemini(item.audioUrl, item.title, onProgress);
        finalContent = result.content;
      } else {
        // Use AssemblyAI for transcription
        onProgress?.({ status: 'processing', message: 'Transcribing audio...' });
        const result = await transcribeAudio(item.audioUrl, onProgress);

        // Polish with Gemini (if API key available)
        finalContent = result.content;
        if (hasGeminiKey()) {
          try {
            onProgress?.({ status: 'processing', message: 'Polishing transcript...' });
            finalContent = await polishTranscript(
              result.content,
              contextPrompt,
              item.title
            );
          } catch (polishError) {
            console.warn('Transcript polishing failed, using raw transcript:', polishError);
          }
        }
      }

      // Update with transcript
      await convex.saveDocument({
        ...doc,
        content: finalContent,
        article: { ...extendedArticle, transcriptionStatus: 'complete' },
      } as ArticleDocument);
    } catch (e) {
      // Update status to error
      await convex.saveDocument({
        ...doc,
        article: { ...extendedArticle, transcriptionStatus: 'error' },
      } as ArticleDocument);
      throw e;
    }
  }, [items, feeds, convex]);

  const hasTranscriptionKey = useCallback((provider: TranscriptionProvider = 'assemblyai') => {
    return provider === 'gemini' ? hasGeminiApiKey() : hasApiKey();
  }, []);

  const setTranscriptionKey = useCallback((key: string) => setApiKey(key), []);

  // Batch transcription
  const transcribeBatch = useCallback(async (
    itemIds: string[],
    onBatchProgress?: (progress: { completed: number; total: number; currentTitle?: string }) => void,
    provider: TranscriptionProvider = 'assemblyai'
  ): Promise<{ succeeded: number; failed: number }> => {
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const item = items.find(it => it.id === itemId);

      onBatchProgress?.({
        completed: i,
        total: itemIds.length,
        currentTitle: item?.title
      });

      try {
        await transcribeItem(itemId, undefined, provider);
        succeeded++;
      } catch (e) {
        console.error(`Failed to transcribe ${item?.title}:`, e);
        failed++;
      }

      if (i < itemIds.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    onBatchProgress?.({
      completed: itemIds.length,
      total: itemIds.length,
    });

    return { succeeded, failed };
  }, [items, transcribeItem]);

  // Folder operations
  const createFolder = useCallback(async (name: string): Promise<Folder> => {
    const folderId = await convex.saveFolder({
      name,
      isOpen: true,
    });
    return {
      id: folderId,
      name,
      isOpen: true,
      sortOrder: convex.folders.length,
    };
  }, [convex]);

  const deleteFolder = useCallback(async (folderId: string) => {
    await convex.deleteFolder(folderId);
  }, [convex]);

  const moveFeedToFolder = useCallback(
    async (feedId: string, folderId: string | undefined) => {
      const feed = convex.getFeed(feedId);
      if (feed) {
        await convex.saveFeed({
          ...feed,
          folderId,
        });
      }
    },
    [convex]
  );

  // Query operations
  const queryItems = useCallback(async (query: DocumentQuery): Promise<FeedItem[]> => {
    const docs = convex.queryDocuments({ ...query, type: 'article' });
    return docs
      .filter((d): d is ArticleDocument => d.type === 'article')
      .map(toOldFeedItem);
  }, [convex]);

  const searchItems = useCallback(async (query: string): Promise<FeedItem[]> => {
    const results = await convex.search(query, 'article');
    return results
      .filter((d): d is ArticleDocument => d.type === 'article')
      .map(toOldFeedItem);
  }, [convex]);

  // Export operations (simplified for Convex - could be enhanced later)
  const exportToMarkdown = useCallback(async () => {
    const result = new Map<string, string>();
    for (const doc of convex.documents) {
      result.set(`${doc.title}.md`, doc.content);
    }
    return result;
  }, [convex]);

  const exportToOPML = useCallback(async () => {
    const feedItems = convex.feeds
      .map((f) => `    <outline type="rss" text="${f.name}" xmlUrl="${f.url}" />`)
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head><title>Doodle Reader Feeds</title></head>
  <body>
${feedItems}
  </body>
</opml>`;
  }, [convex]);

  const importFromOPML = useCallback(async (opml: string) => {
    // Parse OPML and subscribe to feeds
    const parser = new DOMParser();
    const doc = parser.parseFromString(opml, 'text/xml');
    const outlines = doc.querySelectorAll('outline[xmlUrl]');
    let count = 0;
    for (const outline of outlines) {
      const url = outline.getAttribute('xmlUrl');
      if (url) {
        try {
          await subscribe(url);
          count++;
        } catch (e) {
          console.warn(`Failed to import feed ${url}:`, e);
        }
      }
    }
    return count;
  }, [subscribe]);

  // Save a scanned PDF document
  const saveScannedDocument = useCallback(async (
    title: string,
    content: string,
    metadata: {
      pageCount: number;
      fileSizeMB: number;
      processingTimeMs: number;
    }
  ) => {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const doc: ArticleDocument = {
      id,
      type: 'article',
      source: 'scan' as any,
      title,
      created: now,
      modified: now,
      status: 'complete',
      content,
      summary: content.substring(0, 300) + '...',
      tags: ['scanned'],
      article: {
        url: `scan://${id}`,
        feedId: 'scanned-documents',
        feedUrl: 'scan://local',
        siteName: 'Scanned Documents',
        pubDate: now,
        isRead: false,
        isStarred: false,
        excerpt: `${metadata.pageCount} pages, ${metadata.fileSizeMB.toFixed(1)} MB`,
      },
    };

    await convex.saveDocument(doc);
  }, [convex]);

  // Count scanned documents
  const documentCount = useMemo(() => {
    return items.filter(i => i.feedId === 'scanned-documents').length;
  }, [items]);

  // Import a one-off YouTube video
  const importVideo = useCallback(async (url: string) => {
    let videoId: string | null = null;

    if (url.includes('youtube.com/watch')) {
      const urlObj = new URL(url);
      videoId = urlObj.searchParams.get('v');
    } else if (url.includes('youtu.be/')) {
      const match = url.match(/youtu\.be\/([^?&]+)/);
      videoId = match ? match[1] : null;
    }

    if (!videoId) {
      throw new Error('Invalid YouTube URL. Please use a youtube.com/watch or youtu.be link.');
    }

    const transcript = await getTranscript(videoId);
    if (!transcript) {
      throw new Error('Could not fetch transcript. Make sure the video has captions enabled.');
    }

    let title = `Video ${videoId}`;
    let channel: string | null = null;
    let channelUrl: string | null = null;
    let description: string | null = null;

    try {
      const infoResponse = await fetch(`http://localhost:3002/info?v=${videoId}`);
      if (infoResponse.ok) {
        const info = await infoResponse.json();
        title = info.title || title;
        channel = info.channel || null;
        channelUrl = info.channelUrl || null;
        description = info.description || null;
      }
    } catch {
      // Service not available
    }

    const now = new Date().toISOString();
    const id = `yt-oneoff-${videoId}`;

    const existing = convex.getDocument(id);
    if (existing) {
      throw new Error('This video has already been imported.');
    }

    const doc: ArticleDocument = {
      id,
      type: 'article',
      source: 'youtube' as any,
      title,
      created: now,
      modified: now,
      status: 'complete',
      content: transcript,
      summary: transcript.substring(0, 300) + '...',
      tags: ['video', 'one-off'],
      article: {
        url: `https://youtube.com/watch?v=${videoId}`,
        feedId: 'one-off-videos',
        feedUrl: 'oneoff://youtube',
        siteName: channel || 'One-off Videos',
        author: channel || undefined,
        authorUrl: channelUrl || undefined,
        pubDate: now,
        isRead: false,
        isStarred: false,
        excerpt: description ? description.substring(0, 300) : 'YouTube video transcript',
        mediaType: 'video',
      },
    };

    await convex.saveDocument(doc);
  }, [convex]);

  return {
    items,
    feeds,
    folders: convex.folders,
    loading,
    error,
    stats: convex.stats,
    subscribe,
    unsubscribe,
    refreshFeeds,
    refreshFeed,
    markAsRead,
    toggleStar,
    markAllRead,
    updateSummary,
    transcribeItem,
    transcribeBatch,
    hasTranscriptionKey,
    setTranscriptionKey,
    createFolder,
    deleteFolder,
    moveFeedToFolder,
    queryItems,
    searchItems,
    exportToMarkdown,
    exportToOPML,
    importFromOPML,
    saveScannedDocument,
    documentCount,
    importVideo,
  };
}
