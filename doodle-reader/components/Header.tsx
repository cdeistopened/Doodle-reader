import React from 'react';
import { ViewMode } from '../types';
import { Search, LayoutList, CheckCheck, RefreshCw, Settings, Layout } from 'lucide-react';

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
    <div className="bg-reader-bg px-4 py-2 flex items-center justify-between flex-shrink-0 z-10 sticky top-0 h-[64px]">
      
      {/* Search Pill */}
      <div className="flex-grow max-w-3xl relative group">
         <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500">
            <Search size={20} />
         </div>
         <input 
           type="text" 
           className="w-full bg-[#EAF1FB] hover:bg-white hover:shadow-card focus:bg-white focus:shadow-card border-none rounded-full pl-12 pr-4 h-[48px] text-[16px] outline-none transition-all placeholder-gray-500 text-reader-text"
           placeholder="Search in articles"
         />
         <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">
            <Settings size={20} className="hover:bg-gray-200 rounded-full p-0.5 cursor-pointer transition-colors" />
         </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center space-x-2 ml-6">
        
        {unreadCount > 0 && (
          <div className="bg-reader-active text-white text-xs font-bold px-2 py-1 rounded-md mr-2">
             {unreadCount} new
          </div>
        )}

        <button 
          onClick={onRefresh}
          className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
          title="Refresh"
        >
          <RefreshCw size={20} />
        </button>

        <button 
           onClick={onMarkAllRead}
           className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
           title="Mark all as read"
        >
          <CheckCheck size={20} />
        </button>

        {/* View Toggle */}
        <div className="flex bg-[#EAF1FB] rounded-full p-1 ml-2">
           <button 
              onClick={() => onSetViewMode(ViewMode.List)}
              className={`p-1.5 rounded-full transition-all ${viewMode !== ViewMode.Expanded ? 'bg-white shadow-sm text-reader-active' : 'text-gray-500 hover:text-gray-700'}`}
              title="Inbox View"
           >
             <LayoutList size={18} />
           </button>
           <button 
              onClick={() => onSetViewMode(ViewMode.Expanded)}
              className={`p-1.5 rounded-full transition-all ${viewMode === ViewMode.Expanded ? 'bg-white shadow-sm text-reader-active' : 'text-gray-500 hover:text-gray-700'}`}
              title="Stream View"
           >
             <Layout size={18} />
           </button>
        </div>

         <div className="ml-2 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
            U
         </div>
      </div>
    </div>
  );
};