import React, { useState } from 'react';
import { Folder, FeedSource, FilterType, FeedItem } from '../types';
import { Folder as FolderIcon, Rss, Star, Inbox, Pencil, PlaySquare, FileText, X, Trash2, ScanLine, FolderOpen } from 'lucide-react';

interface SidebarProps {
  folders: Folder[];
  feeds: FeedSource[];
  items: FeedItem[];
  activeFilter: FilterType;
  activeId: string | null;
  onNavigate: (type: FilterType, id?: string) => void;
  onSubscribe: () => void;
  onUnsubscribe?: (feedId: string) => void;
  onScanPdf?: () => void;
  onFolderScan?: () => void;
  documentCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  feeds,
  items,
  activeFilter,
  activeId,
  onNavigate,
  onSubscribe,
  onUnsubscribe,
  onScanPdf,
  onFolderScan,
  documentCount = 0,
}) => {
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState<string | null>(null);

  const handleUnsubscribe = (feedId: string, _feedName: string) => {
    if (confirmUnsubscribe === feedId) {
      // Second click - actually unsubscribe
      onUnsubscribe?.(feedId);
      setConfirmUnsubscribe(null);
      // Navigate to inbox after unsubscribe
      onNavigate('all');
    } else {
      // First click - show confirmation
      setConfirmUnsubscribe(feedId);
      // Auto-clear after 3 seconds
      setTimeout(() => setConfirmUnsubscribe(null), 3000);
    }
  };

  const getUnreadCount = (feedId?: string) => {
    if (!feedId) return items.filter(i => !i.isRead).length;
    return items.filter(i => i.feedId === feedId && !i.isRead).length;
  };

  const totalUnread = getUnreadCount();
  const starredCount = items.filter(i => i.isStarred).length; 
  const videoCount = items.filter(i => i.mediaType === 'video').length;

  const orphanedFeeds = feeds.filter(f => !f.folderId);

  const SidebarItem = ({
    label,
    icon: Icon,
    count,
    isActive,
    onClick,
    color,
    isFeed = false,
    feedId,
  }: any) => (
    <div
      onClick={onClick}
      className={`
        flex items-center px-4 py-1.5 mx-0 sm:mx-2 rounded-r-full sm:rounded-full cursor-pointer select-none transition-colors mb-[2px] group relative
        ${isActive ? 'bg-reader-select text-reader-select-text font-bold' : 'hover:bg-gray-200/50 text-reader-text font-medium'}
      `}
    >
      <div className="flex-shrink-0 w-6 mr-3 flex items-center justify-center">
        {color ? (
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }}></div>
        ) : (
          <Icon size={18} className={isActive ? 'text-reader-active' : 'text-reader-secondary'} />
        )}
      </div>
      <span className={`flex-grow truncate text-[14px] ${isActive ? '' : 'text-reader-secondary'}`}>
        {label}
      </span>
      {count > 0 && !confirmUnsubscribe && (
        <span className={`text-[12px] ml-2 ${isActive ? 'text-reader-select-text font-bold' : 'text-reader-secondary font-medium'}`}>
          {count > 1000 ? '1K+' : count}
        </span>
      )}
      {/* Unsubscribe button for feeds */}
      {isFeed && feedId && onUnsubscribe && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleUnsubscribe(feedId, label);
          }}
          className={`
            ml-2 p-1 rounded-full transition-all
            ${confirmUnsubscribe === feedId
              ? 'bg-red-500 text-white'
              : 'opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-500'
            }
          `}
          title={confirmUnsubscribe === feedId ? 'Click again to confirm' : 'Unsubscribe'}
        >
          {confirmUnsubscribe === feedId ? (
            <Trash2 size={14} />
          ) : (
            <X size={14} />
          )}
        </button>
      )}
    </div>
  );

  return (
    <div className="w-[256px] bg-reader-sidebar flex-shrink-0 h-full overflow-y-auto flex flex-col font-sans pt-4 pb-4">
      
      {/* Doodle Logo */}
      <div className="px-6 mb-4 flex items-center space-x-1 select-none">
         <span className="text-2xl font-sans tracking-tight text-reader-blue font-normal">D</span>
         <span className="text-2xl font-sans tracking-tight text-reader-red font-normal">o</span>
         <span className="text-2xl font-sans tracking-tight text-reader-yellow font-normal">o</span>
         <span className="text-2xl font-sans tracking-tight text-reader-blue font-normal">d</span>
         <span className="text-2xl font-sans tracking-tight text-reader-green font-normal">l</span>
         <span className="text-2xl font-sans tracking-tight text-reader-red font-normal mr-1.5">e</span>
         <span className="text-xl font-sans text-gray-500 font-normal">Reader</span>
      </div>

      {/* Action Buttons */}
      <div className="px-4 mb-6 space-y-2">
        <button
          onClick={onSubscribe}
          className="bg-reader-fab hover:bg-reader-fab-hover text-reader-select-text transition-all rounded-2xl h-14 w-36 flex items-center justify-center shadow-sm hover:shadow-md space-x-3"
        >
          <Pencil size={20} className="text-reader-text" />
          <span className="font-medium text-[14px]">Subscribe</span>
        </button>
        {onScanPdf && (
          <button
            onClick={onScanPdf}
            className="bg-white hover:bg-gray-50 text-reader-text transition-all rounded-2xl h-10 w-36 flex items-center justify-center shadow-sm hover:shadow-md space-x-2 border border-gray-200 mb-2"
          >
            <ScanLine size={16} className="text-reader-secondary" />
            <span className="font-medium text-[13px]">Scan PDF</span>
          </button>
        )}

        {onFolderScan && (
          <button
            onClick={onFolderScan}
            className="bg-white hover:bg-gray-50 text-reader-text transition-all rounded-2xl h-10 w-36 flex items-center justify-center shadow-sm hover:shadow-md space-x-2 border border-gray-200"
          >
            <FolderOpen size={16} className="text-reader-secondary" />
            <span className="font-medium text-[13px]">Scan Folder</span>
          </button>
        )}
      </div>

      <div className="flex-grow">
        <SidebarItem 
          label="Inbox" 
          icon={Inbox} 
          count={totalUnread}
          isActive={activeFilter === 'all'}
          onClick={() => onNavigate('all')}
        />
        <SidebarItem 
          label="Starred" 
          icon={Star} 
          count={starredCount}
          isActive={activeFilter === 'starred'}
          onClick={() => onNavigate('starred')}
        />
        <SidebarItem
          label="Videos"
          icon={PlaySquare}
          count={videoCount}
          isActive={activeFilter === 'video'}
          onClick={() => onNavigate('video')}
        />
        <SidebarItem
          label="Documents"
          icon={FileText}
          count={documentCount}
          isActive={activeFilter === 'folder' && activeId === 'documents'}
          onClick={() => onNavigate('folder', 'documents')}
        />

        <div className="my-3 border-t border-gray-200 mx-4"></div>

        <div className="px-6 py-2 flex items-center justify-between group cursor-pointer">
           <span className="text-[14px] font-medium text-reader-text">Feeds</span>
           <span className="text-xs text-reader-active opacity-0 group-hover:opacity-100 font-medium">Edit</span>
        </div>
        
        {orphanedFeeds.map(feed => (
          <SidebarItem
            key={feed.id}
            label={feed.name}
            icon={Rss}
            color={feed.color}
            count={getUnreadCount(feed.id)}
            isActive={activeFilter === 'feed' && activeId === feed.id}
            onClick={() => onNavigate('feed', feed.id)}
            isFeed={true}
            feedId={feed.id}
          />
        ))}

        {folders.map(folder => (
           <div key={folder.id}>
             <SidebarItem label={folder.name} icon={FolderIcon} count={0} isActive={false} onClick={() => {}} />
           </div>
        ))}
      </div>
    </div>
  );
};