/**
 * Hybrid Storage Hook
 *
 * Uses local IndexedDB for fast feed/article storage (no auth needed).
 * Only persists to Convex when user explicitly saves content (auth required).
 *
 * This gives the best UX:
 * - Instant feed loading (local)
 * - Works without login for browsing
 * - Cloud sync only for saved/processed content
 */

import { useStorage } from './useStorage';
import { useConvexStorageOptional } from '../storage/convex-provider';
import { useAuth } from '@clerk/clerk-react';
import { useCallback } from 'react';
import type { TranscriptionProgress, TranscriptionProvider } from '../transcribe';

export type { TranscriptionProvider };

/**
 * Hybrid storage that uses local IndexedDB for feeds/browsing
 * and Convex for persisted library content.
 *
 * IMPORTANT: This hook must be used inside a ClerkProvider.
 * For non-authenticated usage, use useStorage() directly.
 */
export function useHybridStorage() {
  // Local storage for feeds and articles (fast, no auth)
  const local = useStorage();

  // Convex for persisted library content (optional - only available if provider exists)
  const convex = useConvexStorageOptional();

  // Auth state from Clerk
  const { isSignedIn, isLoaded } = useAuth();

  // Override transcribe to save to Convex when complete
  const transcribeItem = useCallback(async (
    itemId: string,
    onProgress?: (progress: TranscriptionProgress) => void,
    provider?: TranscriptionProvider
  ) => {
    // First, transcribe using local storage (which does the actual work)
    await local.transcribeItem(itemId, onProgress, provider);

    // If user is signed in and Convex is available, also save to Convex library
    if (isSignedIn && convex) {
      const item = local.items.find(i => i.id === itemId);
      if (item && item.transcriptionStatus === 'complete') {
        // Save the transcribed content to Convex
        // Note: Convex schema has extended fields (audioUrl, duration, etc.) that
        // aren't in the local TypeScript types, so we use type assertion
        try {
          // Use 'as any' because Convex schema is more permissive than local types
          // (e.g., allows 'podcast' as source, extended article fields)
          await convex.saveDocument({
            type: 'article',
            title: item.title,
            content: item.content || '',
            source: item.mediaType === 'audio' ? 'podcast' : 'rss',
            status: 'complete',
            tags: [],
            article: {
              url: item.url,
              feedId: item.feedId,
              feedUrl: '',
              siteName: local.feeds.find(f => f.id === item.feedId)?.name || '',
              pubDate: new Date(item.timestamp).toISOString(),
              isRead: item.isRead,
              isStarred: item.isStarred,
              audioUrl: item.audioUrl,
              duration: item.duration?.toString(),
              transcriptionStatus: 'complete',
            },
          } as any);
        } catch (e) {
          console.warn('Failed to sync to Convex:', e);
          // Don't throw - local transcription succeeded
        }
      }
    }
  }, [local, convex, isSignedIn]);

  // Save scanned document - always try Convex if signed in
  const saveScannedDocument = useCallback(async (
    title: string,
    content: string,
    metadata: { pageCount: number; fileSizeMB: number; processingTimeMs: number }
  ) => {
    // Save locally first
    await local.saveScannedDocument(title, content, metadata);

    // Also save to Convex if signed in and Convex is available
    // Note: Convex schema has extended scan fields not in local types
    if (isSignedIn && convex) {
      try {
        // Use 'as any' because Convex schema has extended scan fields
        await convex.saveDocument({
          type: 'scan',
          title,
          content,
          source: 'scan',
          status: 'complete',
          tags: [],
          scan: {
            sourceFile: title,
            pageCount: metadata.pageCount,
            dateScanned: new Date().toISOString(),
            fileSizeMB: metadata.fileSizeMB,
            processingTimeMs: metadata.processingTimeMs,
            ocrEngine: 'gemini',
          },
        } as any);
      } catch (e) {
        console.warn('Failed to sync scan to Convex:', e);
      }
    }
  }, [local, convex, isSignedIn]);

  // Return local storage interface with enhanced save operations
  return {
    // All reads come from local (fast)
    items: local.items,
    feeds: local.feeds,
    folders: local.folders,
    loading: local.loading,
    error: local.error,
    stats: local.stats,
    documentCount: local.documentCount,

    // Feed operations (local only)
    subscribe: local.subscribe,
    unsubscribe: local.unsubscribe,
    refreshFeeds: local.refreshFeeds,
    refreshFeed: local.refreshFeed,

    // Item operations (local only)
    markAsRead: local.markAsRead,
    toggleStar: local.toggleStar,
    markAllRead: local.markAllRead,
    updateSummary: local.updateSummary,

    // Enhanced operations that sync to Convex
    transcribeItem,
    saveScannedDocument,

    // Transcription keys (local)
    hasTranscriptionKey: local.hasTranscriptionKey,
    setTranscriptionKey: local.setTranscriptionKey,

    // Folder operations (local for now)
    createFolder: local.createFolder,
    deleteFolder: local.deleteFolder,
    moveFeedToFolder: local.moveFeedToFolder,

    // Query/export (local)
    queryItems: local.queryItems,
    searchItems: local.searchItems,
    exportToMarkdown: local.exportToMarkdown,
    exportToOPML: local.exportToOPML,
    importFromOPML: local.importFromOPML,

    // Video import (local)
    importVideo: local.importVideo,

    // Auth state for UI to show login prompts
    isSignedIn,
    isAuthLoaded: isLoaded,
  };
}
