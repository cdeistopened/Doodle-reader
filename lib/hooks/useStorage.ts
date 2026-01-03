/**
 * Doodle Reader - useStorage Hook
 *
 * React hook that provides access to the storage layer with
 * automatic state management and reactivity.
 *
 * This replaces direct usage of the old `db` singleton.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { storage } from '../storage';
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
import { transcribeAudio, hasApiKey, setApiKey, type TranscriptionProgress, type TranscriptionProvider } from '../transcribe';
import { transcribeAudioWithGemini, type EpisodeMetadata } from '../transcribeGemini';

export type { TranscriptionProvider };
import { polishTranscript, hasGeminiKey } from '../polish';
import { getTranscript, getVideoMetadata, polishYouTubeTranscript } from '../youtube';

interface UseStorageReturn {
  // State
  items: FeedItem[];
  feeds: OldFeedSource[];
  folders: Folder[];
  loading: boolean;
  error: string | null;
  stats: StorageStats | null;

  // Actions
  subscribe: (url: string) => Promise<void>;
  unsubscribe: (feedId: string, deleteItems?: boolean) => Promise<void>;
  refreshFeeds: () => Promise<void>;
  refreshFeed: (feedId: string) => Promise<void>;
  markAsRead: (itemId: string, isRead?: boolean) => Promise<void>;
  toggleStar: (itemId: string) => Promise<void>;
  markAllRead: (feedId?: string) => Promise<void>;
  updateSummary: (itemId: string, summary: string) => Promise<void>;

  // Transcription
  transcribeItem: (itemId: string, onProgress?: (progress: TranscriptionProgress) => void, provider?: TranscriptionProvider) => Promise<string>;
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

export function useStorage(): UseStorageReturn {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [feeds, setFeeds] = useState<OldFeedSource[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);

  // Initialize and load data
  useEffect(() => {
    const init = async () => {
      try {
        await storage.init();
        await loadAll();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to initialize storage');
      } finally {
        setLoading(false);
      }
    };
    init();

    // Subscribe to storage events for reactivity
    const unsubscribe = storage.subscribe((event) => {
      // Reload relevant data based on event type
      if (event.type.startsWith('document:')) {
        loadItems();
      } else if (event.type.startsWith('feed:')) {
        loadFeeds();
      } else if (event.type.startsWith('folder:')) {
        loadFolders();
      }
    });

    return () => unsubscribe();
  }, []);

  const loadAll = async () => {
    await Promise.all([loadItems(), loadFeeds(), loadFolders(), loadStats()]);
  };

  const loadItems = async () => {
    const docs = await storage.queryDocuments({
      type: 'article',
      sortBy: 'pubDate',  // Sort by original publication date, not when added
      sortOrder: 'desc',
    });
    const feedItems = docs
      .filter((d): d is ArticleDocument => d.type === 'article')
      .map(toOldFeedItem);
    setItems(feedItems);
  };

  const loadFeeds = async () => {
    const newFeeds = await storage.queryFeeds();
    setFeeds(newFeeds.map(toOldFeedSource));
  };

  const loadFolders = async () => {
    const f = await storage.getFolders();
    setFolders(f);
  };

  const loadStats = async () => {
    const s = await storage.getStats();
    setStats(s);
  };

  // Subscribe to a new feed
  const subscribe = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const { source, items: newItems } = await fetchFeed(url);

      // Check for duplicate
      const existing = await storage.getFeedByUrl(source.url);
      if (existing) {
        throw new Error('Already subscribed to this feed');
      }

      // Convert and save feed
      const newFeed = convertFeedSource(source);
      await storage.saveFeed(newFeed);

      // Convert and save items
      const docs = convertFeedItems(newItems, source.url, source.name);
      for (const doc of docs) {
        // Check if item already exists (by ID)
        const existingDoc = await storage.getDocument(doc.id);
        if (!existingDoc) {
          await storage.saveDocument(doc);
        }
      }

      // Update feed counts
      await storage.updateFeedSyncState(newFeed.id, {
        lastFetched: new Date().toISOString(),
        itemCount: docs.length,
        unreadCount: docs.length,
      });

      await loadAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to subscribe';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Unsubscribe from a feed
  const unsubscribe = useCallback(async (feedId: string, deleteItems = true) => {
    await storage.deleteFeed(feedId, deleteItems);
    await loadAll();
  }, []);

  // Refresh all feeds
  const refreshFeeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const currentFeeds = await storage.queryFeeds();
      for (const feed of currentFeeds) {
        try {
          await refreshSingleFeed(feed);
        } catch (e) {
          console.warn(`Failed to refresh ${feed.name}:`, e);
          await storage.updateFeedSyncState(feed.id, {
            fetchError: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
      await loadAll();
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh a single feed
  const refreshFeed = useCallback(async (feedId: string) => {
    const feed = await storage.getFeed(feedId);
    if (!feed) return;
    await refreshSingleFeed(feed);
    await loadAll();
  }, []);

  const refreshSingleFeed = async (feed: FeedSource) => {
    const { items: newItems } = await fetchFeed(feed.url);
    const docs = convertFeedItems(newItems, feed.url, feed.name);

    let newCount = 0;
    for (const doc of docs) {
      const existingDoc = await storage.getDocument(doc.id);
      if (!existingDoc) {
        await storage.saveDocument(doc);
        newCount++;
      }
    }

    // Update feed state
    const allFeedDocs = await storage.queryDocuments({ feedId: feed.id });
    const unreadCount = allFeedDocs.filter((d) => {
      if (d.type === 'article') {
        return !(d as ArticleDocument).article.isRead;
      }
      return false;
    }).length;

    await storage.updateFeedSyncState(feed.id, {
      lastFetched: new Date().toISOString(),
      itemCount: allFeedDocs.length,
      unreadCount,
      fetchError: undefined,
    });
  };

  // Mark item as read
  const markAsRead = useCallback(async (itemId: string, isRead = true) => {
    await storage.markAsRead(itemId, isRead);
    // Optimistic update
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isRead } : item))
    );
  }, []);

  // Toggle star
  const toggleStar = useCallback(async (itemId: string) => {
    await storage.toggleStar(itemId);
    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, isStarred: !item.isStarred } : item
      )
    );
  }, []);

  // Mark all as read
  const markAllRead = useCallback(async (feedId?: string) => {
    if (feedId) {
      await storage.markFeedAsRead(feedId);
    } else {
      // Mark all articles as read
      const docs = await storage.queryDocuments({ type: 'article', isRead: false });
      for (const doc of docs) {
        await storage.markAsRead(doc.id, true);
      }
    }
    // Optimistic update
    setItems((prev) =>
      prev.map((item) => {
        if (feedId && item.feedId !== feedId) return item;
        return { ...item, isRead: true };
      })
    );
  }, []);

  // Update summary
  const updateSummary = useCallback(async (itemId: string, summary: string) => {
    await storage.updateSummary(itemId, summary);
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, aiSummary: summary } : item
      )
    );
  }, []);

  // Transcription
  const transcribeItem = useCallback(async (
    itemId: string,
    onProgress?: (progress: TranscriptionProgress) => void,
    provider: TranscriptionProvider = 'gemini'
  ) => {
    const item = items.find(i => i.id === itemId);
    if (!item || !item.audioUrl) {
      throw new Error('Item not found or has no audio URL');
    }

    const feed = feeds.find(f => f.id === item.feedId);
    const contextPrompt = feed?.contextPrompt;

    await storage.updateTranscriptionStatus(itemId, 'pending');
    setItems((prev) =>
      prev.map((i) => i.id === itemId ? { ...i, transcriptionStatus: 'pending' } : i)
    );

    try {
      await storage.updateTranscriptionStatus(itemId, 'processing');
      setItems((prev) =>
        prev.map((i) => i.id === itemId ? { ...i, transcriptionStatus: 'processing' } : i)
      );

      let finalContent: string;

      if (provider === 'gemini') {
        onProgress?.({ status: 'processing', message: 'Transcribing with Gemini...' });
        const metadata: EpisodeMetadata = {
          title: item.title,
          feedName: feed?.name,
          author: item.author || undefined,
          description: item.snippet || undefined,
          duration: item.duration || undefined,
          episodeUrl: item.url,
          feedContext: contextPrompt,
        };
        const result = await transcribeAudioWithGemini(item.audioUrl, item.title, onProgress, metadata);
        finalContent = result.content;
      } else {
        onProgress?.({ status: 'processing', message: 'Transcribing audio...' });
        const result = await transcribeAudio(item.audioUrl, onProgress);
        finalContent = result.content;
        
        if (hasGeminiKey()) {
          try {
            onProgress?.({ status: 'processing', message: 'Polishing transcript...' });
            finalContent = await polishTranscript(result.content, contextPrompt, item.title);
          } catch (polishError) {
            console.warn('Transcript polishing failed, using raw transcript:', polishError);
          }
        }
      }

      await storage.updateTranscriptionStatus(itemId, 'complete', finalContent);
      setItems((prev) =>
        prev.map((i) => i.id === itemId ? {
          ...i,
          transcriptionStatus: 'complete',
          transcript: finalContent,
        } : i)
      );
      return finalContent;
    } catch (e) {
      // Update status to error
      await storage.updateTranscriptionStatus(itemId, 'error');
      setItems((prev) =>
        prev.map((i) => i.id === itemId ? { ...i, transcriptionStatus: 'error' } : i)
      );
      throw e;
    }
  }, [items, feeds]);

  const hasTranscriptionKey = useCallback((provider: TranscriptionProvider = 'gemini') => {
    return provider === 'gemini' ? hasGeminiKey() : hasApiKey(provider);
  }, []);
  const setTranscriptionKey = useCallback((key: string) => setApiKey(key), []);

  // Folder operations
  const createFolder = useCallback(async (name: string): Promise<Folder> => {
    const existingFolders = await storage.getFolders();
    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      isOpen: true,
      sortOrder: existingFolders.length,
    };
    await storage.saveFolder(folder);
    await loadFolders();
    return folder;
  }, []);

  const deleteFolder = useCallback(async (folderId: string) => {
    await storage.deleteFolder(folderId);
    await loadAll();
  }, []);

  const moveFeedToFolder = useCallback(
    async (feedId: string, folderId: string | undefined) => {
      const feed = await storage.getFeed(feedId);
      if (feed) {
        feed.folderId = folderId;
        await storage.saveFeed(feed);
        await loadFeeds();
      }
    },
    []
  );

  // Query operations
  const queryItems = useCallback(async (query: DocumentQuery): Promise<FeedItem[]> => {
    const docs = await storage.queryDocuments({ ...query, type: 'article' });
    return docs
      .filter((d): d is ArticleDocument => d.type === 'article')
      .map(toOldFeedItem);
  }, []);

  const searchItems = useCallback(async (query: string): Promise<FeedItem[]> => {
    const results = await storage.search(query, { types: ['article'] });
    return results
      .map((r) => r.document)
      .filter((d): d is ArticleDocument => d.type === 'article')
      .map(toOldFeedItem);
  }, []);

  // Export operations
  const exportToMarkdown = useCallback(async () => {
    return storage.exportAsMarkdown();
  }, []);

  const exportToOPML = useCallback(async () => {
    return storage.exportAsOPML();
  }, []);

  const importFromOPML = useCallback(async (opml: string) => {
    const count = await storage.importFromOPML(opml);
    await loadAll();
    return count;
  }, []);

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

    // Create as a scan document stored as an ArticleDocument
    // We use a special feedId 'scanned-documents' to group them
    const doc: ArticleDocument = {
      id,
      type: 'article',
      source: 'scan' as any, // Using scan source type
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

    await storage.saveDocument(doc);
    await loadItems();
  }, []);

  // Count scanned documents
  const documentCount = useMemo(() => {
    return items.filter(i => i.feedId === 'scanned-documents').length;
  }, [items]);

  // Import a one-off YouTube video
  const importVideo = useCallback(async (url: string) => {
    // Extract video ID from URL
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

    // Fetch comprehensive metadata first
    const metadata = await getVideoMetadata(videoId);

    // Fetch transcript
    const transcript = await getTranscript(videoId);
    
    // If no transcript but we have metadata, offer to save anyway
    const hasTranscript = !!transcript;
    // For videos, always save the description in content field, transcript separately if available
    const contentToSave = metadata.description || 'No description available';

    const now = new Date().toISOString();
    const id = `yt-oneoff-${videoId}`;

    // Check if already imported
    const existing = await storage.getDocument(id);
    if (existing) {
      throw new Error('This video has already been imported.');
    }

    // Format publish date if available
    const publishDate = metadata.publishedAt || now;

    // Create as an article document in the one-off-videos feed
    const doc: ArticleDocument = {
      id,
      type: 'article',
      source: 'youtube' as any,
      title: metadata.title,
      created: now,
      modified: now,
      status: 'complete',
      content: contentToSave, // This will be the description
      summary: metadata.description ? metadata.description.substring(0, 300) + '...' : 'YouTube video',
      tags: ['video', 'one-off', hasTranscript ? 'transcript' : 'no-transcript'],
      article: {
        url: `https://youtube.com/watch?v=${videoId}`,
        feedId: 'one-off-videos',
        feedUrl: 'oneoff://youtube',
        siteName: metadata.author || 'One-off Videos',
        author: metadata.author || undefined,
        authorUrl: metadata.authorUrl || undefined,
        pubDate: publishDate,
        isRead: false,
        isStarred: false,
        excerpt: metadata.description ? metadata.description.substring(0, 160) + '...' : 'YouTube video',
        mediaType: 'video',
        // Store transcript and metadata in extended properties (as any)
        transcript: hasTranscript ? transcript : undefined,
        thumbnailUrl: metadata.thumbnail,
        duration: metadata.duration,
        viewCount: metadata.viewCount,
        hasTranscript,
        publishedAt: metadata.publishedAt,
      } as any,
    };

    await storage.saveDocument(doc);
    await loadItems();
    
    // If we couldn't get transcript, inform user
    if (!hasTranscript) {
      console.warn(`[YouTube] Video imported without transcript. Description saved instead.`);
    }
  }, []);

  return {
    items,
    feeds,
    folders,
    loading,
    error,
    stats,
    subscribe,
    unsubscribe,
    refreshFeeds,
    refreshFeed,
    markAsRead,
    toggleStar,
    markAllRead,
    updateSummary,
    transcribeItem,
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
