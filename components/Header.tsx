import React from 'react';
import { ViewMode } from '../types';
import { Search, LayoutList, CheckCheck, RefreshCw, Layout, Mic, ArrowUpDown, Menu } from 'lucide-react';
import { AuthButton } from './AuthButton';

type SortOrder = 'newest' | 'oldest' | 'longest' | 'shortest';

interface HeaderProps {
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  onMarkAllRead: () => void;
  onRefresh: () => void;
  unreadCount: number;
  showBulkTranscribe?: boolean;
  onBulkTranscribe?: () => void;
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
  onOpenSidebar?: () => void;
  isMobile?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  onSetViewMode,
  onMarkAllRead,
  onRefresh,
  unreadCount,
  showBulkTranscribe,
  onBulkTranscribe,
  sortOrder,
  onSortChange,
  onOpenSidebar,
  isMobile,
}) => {
  // Cycle through sort options
  const cycleSortOrder = () => {
    const orders: SortOrder[] = ['newest', 'oldest', 'longest', 'shortest'];
    const currentIndex = orders.indexOf(sortOrder);
    const nextIndex = (currentIndex + 1) % orders.length;
    onSortChange(orders[nextIndex]);
  };

  const sortLabels: Record<SortOrder, string> = {
    newest: 'Newest',
    oldest: 'Oldest',
    longest: 'Longest',
    shortest: 'Shortest',
  };
  return (
    <div className="bg-cream px-3 md:px-4 py-3 flex items-center justify-between flex-shrink-0 z-10 sticky top-0 h-14 border-b border-border">

      {/* Mobile Menu Button */}
      {onOpenSidebar && (
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-2 -ml-1 mr-2 text-ink hover:bg-cream-dark rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Open menu"
        >
          <Menu size={22} strokeWidth={1.5} />
        </button>
      )}

      {/* Search - hidden on mobile, visible on md+ */}
      <div className="hidden md:block flex-grow max-w-xl relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-ink-muted">
          <Search size={16} strokeWidth={1.5} />
        </div>
        <input
          type="text"
          className="w-full bg-surface-sunken hover:bg-surface focus:bg-surface border border-transparent hover:border-border focus:border-accent focus:ring-2 focus:ring-accent-soft rounded-lg pl-9 pr-4 h-10 text-sm outline-none transition-all placeholder-ink-muted text-ink"
          placeholder="Search articles..."
        />
      </div>

      {/* Mobile: Show unread count as title */}
      {isMobile && (
        <div className="flex-grow">
          <span className="font-medium text-ink text-sm">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 md:ml-4">

        {/* Unread count badge - hidden on mobile since we show it as title */}
        {unreadCount > 0 && !isMobile && (
          <div className="bg-accent text-white text-xs font-medium px-2.5 py-1 rounded-md mr-2 tabular-nums">
            {unreadCount}
          </div>
        )}

        {/* Sort Toggle */}
        <button
          onClick={cycleSortOrder}
          className="flex items-center gap-1.5 px-2 py-1.5 min-h-[44px] text-ink-muted hover:text-ink hover:bg-cream-dark rounded-md transition-colors text-sm"
          title={`Sort by: ${sortLabels[sortOrder]}`}
        >
          <ArrowUpDown size={14} strokeWidth={1.5} />
          <span className="text-xs font-medium hidden sm:inline">{sortLabels[sortOrder]}</span>
        </button>

        <button
          onClick={onRefresh}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-ink hover:bg-cream-dark rounded-md transition-colors"
          title="Refresh feeds"
        >
          <RefreshCw size={18} strokeWidth={1.5} />
        </button>

        <button
          onClick={onMarkAllRead}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-ink hover:bg-cream-dark rounded-md transition-colors"
          title="Mark all as read"
        >
          <CheckCheck size={18} strokeWidth={1.5} />
        </button>

        {/* Bulk Transcribe - only shows for podcast feeds, hidden on mobile */}
        {showBulkTranscribe && onBulkTranscribe && (
          <button
            onClick={onBulkTranscribe}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-muted border-2 border-ink rounded-md shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ml-2"
            title="Bulk transcribe all episodes"
          >
            <Mic size={14} strokeWidth={1.5} />
            <span>Transcribe All</span>
          </button>
        )}

        {/* View Toggle - hidden on mobile */}
        <div className="hidden md:flex bg-surface-sunken border border-border rounded-lg p-0.5 ml-2">
          <button
            onClick={() => onSetViewMode(ViewMode.List)}
            className={`p-1.5 rounded-md transition-all ${viewMode !== ViewMode.Expanded
              ? 'bg-surface shadow-soft text-accent'
              : 'text-ink-muted hover:text-ink'
            }`}
            title="List view"
          >
            <LayoutList size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onSetViewMode(ViewMode.Expanded)}
            className={`p-1.5 rounded-md transition-all ${viewMode === ViewMode.Expanded
              ? 'bg-surface shadow-soft text-accent'
              : 'text-ink-muted hover:text-ink'
            }`}
            title="Card view"
          >
            <Layout size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Auth - only shows when Clerk is configured, hidden on mobile */}
        <div className="hidden md:block">
          <AuthButton />
        </div>
      </div>
    </div>
  );
};