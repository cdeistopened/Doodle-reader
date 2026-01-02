export enum ViewMode {
  List = 'LIST', // The "Inbox" table view
  Detail = 'DETAIL', // The "Open Email" view
  Expanded = 'EXPANDED' // The "Stream" view (legacy Reader style)
}

export interface FeedSource {
  id: string;
  url: string; // The RSS URL
  siteUrl: string; // The website URL
  name: string;
  icon?: string; // Favicon URL
  folderId?: string;
  color?: string; // Fallback color
  contextPrompt?: string; // Show-specific context for transcript polishing (hosts, common guests, proper nouns)
}

export interface FeedItem {
  id: string; // unique GUID or combining url+timestamp
  feedId: string;
  title: string;
  author: string;
  authorUrl?: string; // Author page or channel URL
  snippet: string;
  content: string; // HTML content for expanded view
  url: string;
  timestamp: number;
  isRead: boolean;
  isStarred: boolean;
  aiSummary?: string; // Cache for AI summary
  mediaType?: 'text' | 'video' | 'audio'; // Content type
  // Podcast-specific fields
  audioUrl?: string; // MP3/audio enclosure URL
  duration?: string; // Duration string from RSS (e.g., "01:23:45")
  transcriptionStatus?: 'none' | 'pending' | 'processing' | 'complete' | 'error';
  transcript?: string; // Podcast transcript (separate from content)
}

export interface Folder {
  id: string;
  name: string;
  isOpen: boolean;
}

export type FilterType = 'all' | 'starred' | 'video' | 'folder' | 'feed' | 'processed';

export interface FeedStats {
  totalUnread: number;
  starredUnread: number;
  byFeed: Record<string, number>; // feedId -> unreadCount
  byFolder: Record<string, number>; // folderId -> unreadCount
}