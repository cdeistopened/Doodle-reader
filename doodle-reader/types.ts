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
}

export interface FeedItem {
  id: string; // unique GUID or combining url+timestamp
  feedId: string;
  title: string;
  author: string;
  snippet: string;
  content: string; // HTML content for expanded view
  url: string;
  timestamp: number;
  isRead: boolean;
  isStarred: boolean;
  aiSummary?: string; // Cache for AI summary
  mediaType?: 'text' | 'video'; // New field for content type
}

export interface Folder {
  id: string;
  name: string;
  isOpen: boolean;
}

export type FilterType = 'all' | 'starred' | 'video' | 'folder' | 'feed';

export interface FeedStats {
  totalUnread: number;
  starredUnread: number;
  byFeed: Record<string, number>; // feedId -> unreadCount
  byFolder: Record<string, number>; // folderId -> unreadCount
}