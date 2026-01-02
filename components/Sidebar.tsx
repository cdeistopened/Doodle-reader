import React, { useState, useMemo } from 'react';
import { Folder, FeedSource, FilterType, FeedItem } from '../types';
import { Folder as FolderIcon, Rss, Star, Inbox, Plus, PlaySquare, FileText, X, Trash2, ScanLine, FolderOpen, Camera, Search, Sparkles, Menu } from 'lucide-react';
import { fuzzySearchFeeds } from '../lib/feedDiscovery';
import { UsageSummary } from './UpgradePrompt';
import { BoardsPanel } from './BoardsPanel';
import { Id } from '../convex/_generated/dataModel';
import { AuthButton } from './AuthButton';

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
  onPhotoScan?: () => void;
  documentCount?: number;
  isOpen?: boolean;
  onClose?: () => void;
  onUpgrade?: () => void;
  showUsage?: boolean;
  // Boards
  activeBoard?: Id<"boards"> | null;
  onSelectBoard?: (boardId: Id<"boards">) => void;
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
  onPhotoScan,
  documentCount = 0,
  isOpen = true,
  onClose,
  onUpgrade,
  showUsage = false,
  activeBoard,
  onSelectBoard,
}) => {
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState('');

  // Filter feeds using fuzzy search
  const filteredFeeds = useMemo(() => {
    const orphaned = feeds.filter(f => !f.folderId);
    if (!feedFilter.trim()) return orphaned;
    return fuzzySearchFeeds(orphaned, feedFilter);
  }, [feeds, feedFilter]);

  const handleUnsubscribe = (feedId: string, _feedName: string) => {
    if (confirmUnsubscribe === feedId) {
      onUnsubscribe?.(feedId);
      setConfirmUnsubscribe(null);
      onNavigate('all');
    } else {
      setConfirmUnsubscribe(feedId);
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
  const processedCount = items.filter(i => i.transcriptionStatus === 'complete').length;

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
        flex items-center px-3 py-2 mx-2 rounded-md cursor-pointer select-none transition-all duration-150 mb-0.5 group relative
        ${isActive
          ? 'bg-accent-soft text-ink font-medium'
          : 'hover:bg-cream-dark text-ink-soft hover:text-ink'
        }
      `}
    >
      <div className="flex-shrink-0 w-5 mr-3 flex items-center justify-center">
        {color ? (
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }}></div>
        ) : (
          <Icon size={16} className={isActive ? 'text-accent' : 'text-ink-muted'} strokeWidth={1.5} />
        )}
      </div>
      <span className="flex-grow truncate text-sm">
        {label}
      </span>
      {count > 0 && !confirmUnsubscribe && (
        <span className={`text-xs tabular-nums ml-2 ${isActive ? 'text-accent font-medium' : 'text-ink-muted'}`}>
          {count > 999 ? '999+' : count}
        </span>
      )}
      {isFeed && feedId && onUnsubscribe && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleUnsubscribe(feedId, label);
          }}
          className={`
            ml-2 p-1 rounded transition-all
            ${confirmUnsubscribe === feedId
              ? 'bg-status-error text-white'
              : 'opacity-0 group-hover:opacity-100 hover:bg-status-error/10 text-status-error'
            }
          `}
          title={confirmUnsubscribe === feedId ? 'Click again to confirm' : 'Unsubscribe'}
        >
          {confirmUnsubscribe === feedId ? <Trash2 size={12} /> : <X size={12} />}
        </button>
      )}
    </div>
  );

  // Handle navigation with auto-close on mobile
  const handleNavigate = (type: FilterType, id?: string) => {
    onNavigate(type, id);
    onClose?.(); // Close sidebar on mobile after navigation
  };

  const handleSubscribeClick = () => {
    onSubscribe();
    onClose?.();
  };

  const handleScanPdf = () => {
    onScanPdf?.();
    onClose?.();
  };

  const handleFolderScan = () => {
    onFolderScan?.();
    onClose?.();
  };

  const handlePhotoScan = () => {
    // Open PageSnap in new window (Python/Flask app with motion detection)
    const pageSnapUrl = import.meta.env.VITE_PAGESNAP_URL || (
      import.meta.env.DEV
        ? 'http://localhost:5001'
        : 'https://doodle-reader-production.up.railway.app/pagesnap' // Will be deployed as part of main app
    );
    window.open(pageSnapUrl, 'pagesnap', 'width=1200,height=900');
    onClose?.();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-ink/30 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-50 md:z-auto
        w-[280px] md:w-[260px] bg-cream-warm border-r border-border flex-shrink-0 h-full overflow-y-auto flex flex-col
        transform transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>

        {/* Logo */}
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 select-none">
            <div className="w-8 h-8 bg-accent border-2 border-ink rounded-md shadow-brutal-sm flex items-center justify-center">
              <span className="font-mono text-white text-lg font-bold leading-none">d</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-mono text-base font-bold text-ink tracking-tight">doodle</span>
              <span className="font-mono text-[10px] text-ink-muted uppercase tracking-widest">reader</span>
            </div>
          </div>
          {/* Close button on mobile */}
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-2 -mr-2 text-ink-muted hover:text-ink hover:bg-cream-dark rounded-md transition-colors"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-3 space-y-2">
          <button
            onClick={handleSubscribeClick}
            className="w-full bg-accent hover:bg-accent-muted text-white transition-all rounded-md h-10 md:h-10 min-h-[44px] flex items-center justify-center space-x-2 border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus size={18} strokeWidth={2} />
            <span className="font-medium text-sm">Subscribe</span>
          </button>

          <div className="flex gap-2">
            {onScanPdf && (
              <button
                onClick={handleScanPdf}
                className="flex-1 bg-surface hover:bg-cream text-ink transition-all rounded-md min-h-[44px] md:h-9 flex items-center justify-center space-x-1.5 border-2 border-border hover:border-ink"
              >
                <ScanLine size={14} strokeWidth={1.5} />
                <span className="font-medium text-xs">PDF</span>
              </button>
            )}
            {onFolderScan && (
              <button
                onClick={handleFolderScan}
                className="flex-1 bg-surface hover:bg-cream text-ink transition-all rounded-md min-h-[44px] md:h-9 flex items-center justify-center space-x-1.5 border-2 border-border hover:border-ink"
              >
                <FolderOpen size={14} strokeWidth={1.5} />
                <span className="font-medium text-xs">Folder</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-grow py-2">
          <SidebarItem
            label="Inbox"
            icon={Inbox}
            count={totalUnread}
            isActive={activeFilter === 'all'}
            onClick={() => handleNavigate('all')}
          />
          <SidebarItem
            label="Starred"
            icon={Star}
            count={starredCount}
            isActive={activeFilter === 'starred'}
            onClick={() => handleNavigate('starred')}
          />
          <SidebarItem
            label="Videos"
            icon={PlaySquare}
            count={videoCount}
            isActive={activeFilter === 'video'}
            onClick={() => handleNavigate('video')}
          />
          <SidebarItem
            label="Library"
            icon={Sparkles}
            count={processedCount}
            isActive={activeFilter === 'processed'}
            onClick={() => handleNavigate('processed')}
          />
          <SidebarItem
            label="Scans"
            icon={FileText}
            count={documentCount}
            isActive={activeFilter === 'folder' && activeId === 'documents'}
            onClick={() => handleNavigate('folder', 'documents')}
          />

          {/* Boards Section */}
          {onSelectBoard && (
            <div className="mt-4 pt-4 border-t border-border mx-3">
              <BoardsPanel
                activeBoard={activeBoard ?? null}
                onSelectBoard={(boardId) => {
                  onSelectBoard(boardId);
                  onClose?.(); // Close sidebar on mobile
                }}
              />
            </div>
          )}

          {/* Feeds Section */}
          <div className="mt-4 pt-4 border-t border-border mx-3">
            <div className="px-1 pb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Feeds</span>
              <span className="text-xs text-ink-muted">{feeds.filter(f => !f.folderId).length}</span>
            </div>

            {/* Feed Search */}
            {feeds.filter(f => !f.folderId).length > 5 && (
              <div className="relative mb-2">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  value={feedFilter}
                  onChange={(e) => setFeedFilter(e.target.value)}
                  placeholder="Filter feeds..."
                  className="w-full pl-7 pr-2 py-1.5 text-xs bg-surface border border-border rounded focus:outline-none focus:border-accent placeholder-ink-muted"
                />
                {feedFilter && (
                  <button
                    onClick={() => setFeedFilter('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            )}

            {filteredFeeds.map(feed => (
              <SidebarItem
                key={feed.id}
                label={feed.name}
                icon={Rss}
                color={feed.color}
                count={getUnreadCount(feed.id)}
                isActive={activeFilter === 'feed' && activeId === feed.id}
                onClick={() => handleNavigate('feed', feed.id)}
                isFeed={true}
                feedId={feed.id}
              />
            ))}

            {feedFilter && filteredFeeds.length === 0 && (
              <div className="px-3 py-2 text-xs text-ink-muted italic">
                No feeds match "{feedFilter}"
              </div>
            )}

            {folders.map(folder => (
              <div key={folder.id}>
                <SidebarItem label={folder.name} icon={FolderIcon} count={0} isActive={false} onClick={() => {}} />
              </div>
            ))}
          </div>

          {/* Utilities Section */}
          {onPhotoScan && (
            <div className="mt-4 pt-4 border-t border-border mx-3">
              <div className="px-1 pb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Utilities</span>
              </div>

              <button
                onClick={handlePhotoScan}
                className="w-full flex items-center px-3 py-2 mx-0 rounded-md cursor-pointer select-none transition-all duration-150 mb-0.5 group hover:bg-cream-dark text-ink-soft hover:text-ink min-h-[44px] md:min-h-0"
              >
                <div className="flex-shrink-0 w-5 mr-3 flex items-center justify-center">
                  <Camera size={16} className="text-ink-muted" strokeWidth={1.5} />
                </div>
                <span className="flex-grow truncate text-sm text-left">Photo Scan</span>
              </button>
            </div>
          )}
        </div>

        {/* Usage Summary - show when authenticated */}
        {showUsage && onUpgrade && (
          <div className="p-3 border-t border-border">
            <UsageSummary onUpgrade={onUpgrade} />
          </div>
        )}

        {/* Account Section - visible on mobile, AuthButton shows only when Clerk configured */}
        <div className="md:hidden p-3 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">Account</span>
            <AuthButton hideBorder />
          </div>
        </div>

        {/* Footer - hidden on mobile */}
        <div className="p-3 border-t border-border hidden md:block">
          <div className="text-xs text-ink-muted text-center">
            <span className="font-mono">⌘K</span> to search
          </div>
        </div>
      </div>
    </>
  );
};

// Mobile hamburger button to be exported
export const MobileMenuButton: React.FC<{ onClick: () => void; unreadCount?: number }> = ({ onClick, unreadCount = 0 }) => (
  <button
    onClick={onClick}
    className="md:hidden p-2 -ml-2 text-ink hover:bg-cream-dark rounded-md transition-colors relative"
    aria-label="Open menu"
  >
    <Menu size={22} strokeWidth={1.5} />
    {unreadCount > 0 && (
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent text-white text-[10px] font-medium rounded-full flex items-center justify-center">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    )}
  </button>
);