/**
 * Doodle Reader - Type Adapters
 *
 * Converts between old types (FeedItem, FeedSource from types.ts)
 * and new unified storage types.
 *
 * This allows gradual migration without breaking existing code.
 */

import type {
  ArticleDocument,
  FeedSource as NewFeedSource,
} from './types';

// Import old types
import type { FeedItem, FeedSource as OldFeedSource } from '../../types';

/**
 * Convert old FeedSource to new FeedSource format
 */
export function convertFeedSource(old: OldFeedSource): NewFeedSource {
  return {
    id: old.id,
    url: old.url,
    siteUrl: old.siteUrl,
    name: old.name,
    icon: old.icon,
    color: old.color,
    folderId: old.folderId,
    feedType: 'rss', // Default to RSS, can be updated for podcasts
    contextPrompt: old.contextPrompt,
  };
}

/**
 * Convert new FeedSource back to old format (for compatibility)
 */
export function toOldFeedSource(feed: NewFeedSource): OldFeedSource {
  return {
    id: feed.id,
    url: feed.url,
    siteUrl: feed.siteUrl,
    name: feed.name,
    icon: feed.icon,
    color: feed.color,
    folderId: feed.folderId,
    contextPrompt: feed.contextPrompt,
  };
}

/**
 * Convert old FeedItem to new ArticleDocument format
 */
export function convertFeedItem(
  item: FeedItem,
  feedUrl: string,
  siteName: string
): ArticleDocument {
  const now = new Date().toISOString();
  const pubDate = new Date(item.timestamp).toISOString();

  // Extended article properties for podcasts
  const articleProps: any = {
    url: item.url,
    feedId: item.feedId,
    feedUrl: feedUrl,
    siteName: siteName,
    author: item.author,
    pubDate: pubDate,
    isRead: item.isRead,
    isStarred: item.isStarred,
    excerpt: item.snippet,
  };

  // Add podcast-specific fields if present
  if (item.audioUrl) {
    articleProps.audioUrl = item.audioUrl;
    articleProps.duration = item.duration;
    articleProps.transcriptionStatus = item.transcriptionStatus || 'none';
  }

  return {
    id: item.id,
    type: 'article',
    source: item.mediaType === 'audio' ? 'podcast' as any : 'rss',
    title: item.title,
    created: now,
    modified: now,
    status: 'complete',
    content: item.content,
    // DON'T set summary from snippet - summary is reserved for polished AI content only
    // The snippet is already stored in article.excerpt
    summary: item.aiSummary, // Only set if there's actual polished content
    tags: [],
    article: articleProps,
  };
}

/**
 * Convert ArticleDocument back to old FeedItem format (for compatibility with existing UI)
 */
export function toOldFeedItem(doc: ArticleDocument): FeedItem {
  // Detect media type from URL or stored data
  let mediaType: 'text' | 'video' | 'audio' = 'text';
  const url = doc.article.url || '';
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    mediaType = 'video';
  }

  // Check if we have audio URL stored (extended article props for podcasts)
  const extendedProps = doc.article as any;
  if (extendedProps.audioUrl) {
    mediaType = 'audio';
  }

  return {
    id: doc.id,
    feedId: doc.article.feedId,
    title: doc.title,
    author: doc.article.author || '',
    authorUrl: doc.article.authorUrl,
    snippet: doc.article.excerpt || '',  // Don't fall back to summary - that's for polished content
    content: doc.content,
    url: doc.article.url,
    timestamp: new Date(doc.article.pubDate).getTime(),
    isRead: doc.article.isRead,
    isStarred: doc.article.isStarred,
    aiSummary: doc.summary || undefined,  // Only set if there's actual polished content
    mediaType,
    audioUrl: extendedProps.audioUrl,
    duration: extendedProps.duration,
    transcriptionStatus: extendedProps.transcriptionStatus || (extendedProps.audioUrl ? 'none' : undefined),
  };
}

/**
 * Batch convert feed items
 */
export function convertFeedItems(
  items: FeedItem[],
  feedUrl: string,
  siteName: string
): ArticleDocument[] {
  return items.map((item) => convertFeedItem(item, feedUrl, siteName));
}

/**
 * Batch convert to old format
 */
export function toOldFeedItems(docs: ArticleDocument[]): FeedItem[] {
  return docs.map(toOldFeedItem);
}
