import React from 'react';
import { ViewMode } from '../types';
import { Search, LayoutList, CheckCheck, RefreshCw, Layout } from 'lucide-react';
import { AuthButton } from './AuthButton';

interface HeaderProps {
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  onMarkAllRead: () => void;
  onRefresh: () => void;
  unreadCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  onSetViewMode,
  onMarkAllRead,
  onRefresh,
  unreadCount
}) => {
  return (
    <div className="bg-cream px-4 py-3 flex items-center justify-between flex-shrink-0 z-10 sticky top-0 h-14 border-b border-border">

      {/* Search */}
      <div className="flex-grow max-w-xl relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-ink-muted">
          <Search size={16} strokeWidth={1.5} />
        </div>
        <input
          type="text"
          className="w-full bg-surface-sunken hover:bg-surface focus:bg-surface border border-transparent hover:border-border focus:border-accent focus:ring-2 focus:ring-accent-soft rounded-lg pl-9 pr-4 h-10 text-sm outline-none transition-all placeholder-ink-muted text-ink"
          placeholder="Search articles..."
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 ml-4">

        {unreadCount > 0 && (
          <div className="bg-accent text-white text-xs font-medium px-2.5 py-1 rounded-md mr-2 tabular-nums">
            {unreadCount}
          </div>
        )}

        <button
          onClick={onRefresh}
          className="p-2 text-ink-muted hover:text-ink hover:bg-cream-dark rounded-md transition-colors"
          title="Refresh feeds"
        >
          <RefreshCw size={18} strokeWidth={1.5} />
        </button>

        <button
          onClick={onMarkAllRead}
          className="p-2 text-ink-muted hover:text-ink hover:bg-cream-dark rounded-md transition-colors"
          title="Mark all as read"
        >
          <CheckCheck size={18} strokeWidth={1.5} />
        </button>

        {/* View Toggle */}
        <div className="flex bg-surface-sunken border border-border rounded-lg p-0.5 ml-2">
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

        {/* Auth - only shows when Clerk is configured */}
        <AuthButton />
      </div>
    </div>
  );
};