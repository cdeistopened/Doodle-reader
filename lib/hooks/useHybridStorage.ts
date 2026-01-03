/**
 * Hybrid Storage Hook
 *
 * Uses local IndexedDB for fast feed/article storage (no auth needed).
 * Only persists to Convex when user explicitly saves content (auth required).
 *
 * STORAGE STRATEGY:
 * - Local (IndexedDB): RSS articles (ephemeral), feed items for browsing
 * - Convex (cloud): Feed subscriptions, starred items, transcripts, scans, board items
 *
 * This gives the best UX:
 * - Instant feed loading (local)
 * - Works without login for browsing
 * - Cloud sync for important user data (subscriptions, stars, transcripts)
 * - Reduced Convex bandwidth (articles stay local)
 */

import { useStorage } from './useStorage';
import { useConvexStorageOptional } from '../storage/convex-provider';
import { useAuth } from '@clerk/clerk-react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCallback, useEffect, useRef } from 'react';
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
  const incrementUsage = useAction(api.stripe.incrementUsage);

  // Track if we've done initial feed sync from Convex
  const hasSyncedFeeds = useRef(false);

  // =============================================================================
  // FEED SUBSCRIPTION SYNC
  // When user logs in, pull their feed subscriptions from Convex to local
  // =============================================================================
  useEffect(() => {
    if (!isSignedIn || !convex || !isLoaded || hasSyncedFeeds.current) return;
    if (local.loading) return; // Wait for local storage to be ready

    const syncFeedsFromConvex = async () => {
      try {
        // Get feeds from Convex
        const convexFeeds = convex.feeds;
        if (convexFeeds.length === 0) {
          // No feeds in Convex - user might be new or hasn't synced yet
          // Push local feeds TO Convex
          for (const localFeed of local.feeds) {
            const existsInConvex = convexFeeds.find(f => f.url === localFeed.url);
            if (!existsInConvex) {
              try {
                // OldFeedSource doesn't have description or feedType, use defaults
                await convex.saveFeed({
                  url: localFeed.url,
                  siteUrl: localFeed.siteUrl || localFeed.url,
                  name: localFeed.name,
                  icon: localFeed.icon,
                  feedType: 'rss',  // Default, can be detected later
                  folderId: localFeed.folderId,
                  contextPrompt: localFeed.contextPrompt,
                });
              } catch (e) {
                console.warn('Failed to sync feed to Convex:', localFeed.name, e);
              }
            }
          }
        } else {
          // Convex has feeds - merge with local
          for (const convexFeed of convexFeeds) {
            const existsLocally = local.feeds.find(f => f.url === convexFeed.url);
            if (!existsLocally) {
              // This feed exists in Convex but not locally - subscribe locally
              try {
                await local.subscribe(convexFeed.url);
              } catch (e) {
                console.warn('Failed to sync feed from Convex:', convexFeed.name, e);
              }
            }
          }
        }
        hasSyncedFeeds.current = true;
      } catch (e) {
        console.warn('Feed sync failed:', e);
      }
    };

    syncFeedsFromConvex();
  }, [isSignedIn, isLoaded, convex, local.loading, local.feeds]);

  // =============================================================================
  // SYNC LOCAL FEEDS TO CONVEX
  // When local feeds change, sync any new ones to Convex
  // =============================================================================
  const prevLocalFeedsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isSignedIn || !convex || !isLoaded) return;
    if (local.loading) return;

    const syncNewFeedsToConvex = async () => {
      const currentUrls = local.feeds.map(f => f.url);
      const prevUrls = prevLocalFeedsRef.current;

      // Find feeds that are in current but not in previous (newly added)
      const newUrls = currentUrls.filter(url => !prevUrls.includes(url));

      for (const url of newUrls) {
        // Check if already in Convex
        const existsInConvex = convex.getFeedByUrl(url);
        if (!existsInConvex) {
          const localFeed = local.feeds.find(f => f.url === url);
          if (localFeed) {
            try {
              // OldFeedSource doesn't have description or feedType, use defaults
              await convex.saveFeed({
                url: localFeed.url,
                siteUrl: localFeed.siteUrl || localFeed.url,
                name: localFeed.name,
                icon: localFeed.icon,
                feedType: 'rss',  // Default, can be detected later
                folderId: localFeed.folderId,
                contextPrompt: localFeed.contextPrompt,
              });
            } catch (e) {
              console.warn('Failed to sync new feed to Convex:', localFeed.name, e);
            }
          }
        }
      }

      prevLocalFeedsRef.current = currentUrls;
    };

    syncNewFeedsToConvex();
  }, [isSignedIn, isLoaded, convex, local.loading, local.feeds]);

  // =============================================================================
  // ENHANCED UNSUBSCRIBE - Remove feed from Convex too
  // =============================================================================
  const unsubscribe = useCallback(async (feedId: string, deleteItems?: boolean) => {
    // Get feed URL before deleting (for Convex lookup)
    const feed = local.feeds.find(f => f.id === feedId);

    // Unsubscribe locally
    await local.unsubscribe(feedId, deleteItems);

    // Also remove from Convex if signed in
    if (isSignedIn && convex && feed) {
      try {
        const convexFeed = convex.getFeedByUrl(feed.url);
        if (convexFeed) {
          await convex.deleteFeed(convexFeed.id, false); // Don't delete cloud docs
        }
      } catch (e) {
        console.warn('Failed to remove feed from Convex:', e);
      }
    }
  }, [local, convex, isSignedIn]);

  // =============================================================================
  // ENHANCED TOGGLE STAR - Sync starred items to Convex
  // Starred items are important user data that should persist in cloud
  // =============================================================================
  const toggleStar = useCallback(async (itemId: string) => {
    // Get the item BEFORE toggling to know its current state
    const item = local.items.find(i => i.id === itemId);
    if (!item) return;

    const wasStarred = item.isStarred;

    // Toggle locally
    await local.toggleStar(itemId);

    // If NOW starred (was not starred before) AND signed in, save to Convex
    // If now unstarred, we could remove from Convex but that's more complex
    // For now, we just sync starred items TO Convex
    if (!wasStarred && isSignedIn && convex) {
      try {
        await convex.saveDocument({
          type: 'article',
          title: item.title,
          content: item.content || item.aiSummary || '',
          source: item.mediaType === 'audio' ? 'podcast' : 'rss',
          status: 'complete',
          tags: ['starred'],
          article: {
            url: item.url,
            feedId: item.feedId,
            feedUrl: local.feeds.find(f => f.id === item.feedId)?.url || '',
            siteName: local.feeds.find(f => f.id === item.feedId)?.name || '',
            pubDate: new Date(item.timestamp).toISOString(),
            isRead: item.isRead,
            isStarred: true,
            excerpt: item.aiSummary?.substring(0, 300),
            mediaType: item.mediaType,
            audioUrl: item.audioUrl,
            duration: item.duration?.toString(),
          },
        } as any);
      } catch (e) {
        console.warn('Failed to sync starred item to Convex:', e);
        // Don't throw - local star succeeded
      }
    }
  }, [local.items, local.feeds, local.toggleStar, convex, isSignedIn]);

  const transcribeItem = useCallback(async (
    itemId: string,
    onProgress?: (progress: TranscriptionProgress) => void,
    provider?: TranscriptionProvider
  ): Promise<string> => {
    const item = local.items.find(i => i.id === itemId);
    const duration = item?.duration;

    const transcript = await local.transcribeItem(itemId, onProgress, provider);

    if (duration) {
      const parts = duration.split(':').map(Number);
      let minutes = 1;
      if (parts.length === 3) minutes = Math.ceil(parts[0] * 60 + parts[1] + parts[2] / 60);
      else if (parts.length === 2) minutes = Math.ceil(parts[0] + parts[1] / 60);
      incrementUsage({ action: 'transcribe', amount: minutes }).catch(() => {});
    }

    if (isSignedIn && convex && item) {
      try {
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
            transcript: transcript,
          },
        } as any);
      } catch (e) {
        console.warn('Failed to sync to Convex:', e);
      }
    }
    return transcript;
  }, [local, convex, isSignedIn, incrementUsage]);

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

    // Feed operations (synced to Convex when signed in)
    subscribe: local.subscribe,  // Local subscribe; effect syncs to Convex
    unsubscribe,                 // Enhanced: removes from Convex too
    refreshFeeds: local.refreshFeeds,  // Local only (articles stay local)
    refreshFeed: local.refreshFeed,    // Local only

    // Item operations
    markAsRead: local.markAsRead,      // Local only (read state is ephemeral)
    toggleStar,                         // Enhanced: syncs starred items to Convex
    markAllRead: local.markAllRead,    // Local only
    updateSummary: local.updateSummary, // Local only

    // Enhanced operations that sync to Convex
    transcribeItem,     // Syncs transcript to Convex
    saveScannedDocument, // Syncs scan to Convex

    // Transcription keys (local)
    hasTranscriptionKey: local.hasTranscriptionKey,
    setTranscriptionKey: local.setTranscriptionKey,

    // Folder operations (local for now - could sync later)
    createFolder: local.createFolder,
    deleteFolder: local.deleteFolder,
    moveFeedToFolder: local.moveFeedToFolder,

    // Query/export (local)
    queryItems: local.queryItems,
    searchItems: local.searchItems,
    exportToMarkdown: local.exportToMarkdown,
    exportToOPML: local.exportToOPML,
    importFromOPML: local.importFromOPML,

    // Video import (local, but transcript syncs to Convex)
    importVideo: local.importVideo,

    // Auth state for UI to show login prompts
    isSignedIn,
    isAuthLoaded: isLoaded,

    // Convex access for boards (documents must be in Convex to add to boards)
    convex,
  };
}
