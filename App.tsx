import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { FeedList } from './components/FeedList';
import { Header } from './components/Header';
import { SubscribeModal } from './components/SubscribeModal';
import { ScanModal } from './components/ScanModal';
import { FolderScanModal } from './components/FolderScanModal';
import { BulkTranscribeModal } from './components/BulkTranscribeModal';
import { ViewMode, FilterType, FeedItem, FeedSource } from './types';
import { useStorage, useConvexStorageHook, useMobile } from './lib/hooks';
import { ConvexStorageProvider } from './lib/storage/convex-provider';
import type { Folder } from './lib/storage';

export type StorageMode = 'local' | 'convex';

interface AppProps {
  storageMode?: StorageMode;
}

// Type for the storage hook return value (both hooks return the same shape)
interface StorageHookReturn {
  items: FeedItem[];
  feeds: FeedSource[];
  folders: Folder[];
  loading: boolean;
  error: string | null;
  subscribe: (url: string, onProgress?: (count: number) => void) => Promise<void>;
  unsubscribe: (feedId: string, deleteItems?: boolean) => Promise<void>;
  refreshFeeds: () => Promise<void>;
  markAsRead: (itemId: string, isRead?: boolean) => Promise<void>;
  toggleStar: (itemId: string) => Promise<void>;
  markAllRead: (feedId?: string) => Promise<void>;
  updateSummary: (itemId: string, summary: string) => Promise<void>;
  transcribeItem: (itemId: string, onProgress?: any, provider?: any) => Promise<void>;
  hasTranscriptionKey: (provider?: any) => boolean;
  setTranscriptionKey: (key: string) => void;
  saveScannedDocument: (title: string, content: string, metadata: any) => Promise<void>;
  documentCount: number;
  importVideo: (url: string) => Promise<void>;
}

/**
 * Main app content - receives storage operations as props.
 * This component contains all the UI logic and is storage-agnostic.
 */
function AppContent({ storage }: { storage: StorageHookReturn }) {
  const {
    items,
    feeds,
    folders,
    loading,
    error,
    subscribe,
    unsubscribe,
    refreshFeeds,
    markAsRead,
    toggleStar,
    markAllRead,
    updateSummary,
    transcribeItem,
    hasTranscriptionKey,
    setTranscriptionKey,
    saveScannedDocument,
    documentCount,
    importVideo,
  } = storage;

  const isMobile = useMobile();

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterId, setFilterId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.List);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'longest' | 'shortest'>('newest');

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isSubscribeOpen, setSubscribeOpen] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [isScanOpen, setScanOpen] = useState(false);
  const [isFolderScanOpen, setFolderScanOpen] = useState(false);
  const [isBulkTranscribeOpen, setBulkTranscribeOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleSubscribe = async (url: string, onProgress?: (count: number) => void) => {
    setSubscribeError(null);
    try {
      await subscribe(url, onProgress);
      setSubscribeOpen(false);
    } catch (e) {
      setSubscribeError(e instanceof Error ? e.message : 'Failed to subscribe');
    }
  };

  const handleImportVideo = async (url: string) => {
    setSubscribeError(null);
    try {
      await importVideo(url);
      setSubscribeOpen(false);
    } catch (e) {
      setSubscribeError(e instanceof Error ? e.message : 'Failed to import video');
    }
  };

  // Filter and Sort Logic
  const filteredItems = useMemo(() => {
    let result = items;
    if (filterType === 'starred') {
      result = items.filter(i => i.isStarred);
    } else if (filterType === 'video') {
      result = items.filter(i => i.mediaType === 'video');
    } else if (filterType === 'processed') {
      result = items.filter(i => i.transcriptionStatus === 'complete');
    } else if (filterType === 'folder' && filterId === 'documents') {
      result = items.filter(i => i.feedId === 'scanned-documents');
    } else if (filterType === 'feed' && filterId) {
      result = items.filter(i => i.feedId === filterId);
    }

    const sorted = [...result].sort((a, b) => {
      switch (sortOrder) {
        case 'oldest':
          return a.timestamp - b.timestamp;
        case 'longest':
          return (b.content?.length || 0) - (a.content?.length || 0);
        case 'shortest':
          return (a.content?.length || 0) - (b.content?.length || 0);
        case 'newest':
        default:
          return b.timestamp - a.timestamp;
      }
    });

    return sorted;
  }, [items, filterType, filterId, sortOrder]);

  const handleOpenItem = useCallback((id: string) => {
    setExpandedId(id);
    if (viewMode === ViewMode.List) {
      setViewMode(ViewMode.Detail);
    }
    const item = items.find(i => i.id === id);
    if (item && !item.isRead) {
      markAsRead(item.id, true);
    }
  }, [items, viewMode, markAsRead]);

  const handleBackToList = useCallback(() => {
    setViewMode(ViewMode.List);
    setExpandedId(null);
  }, []);

  const handleSelectItem = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleToggleStar = useCallback((e: React.MouseEvent | null, id: string) => {
    if (e) e.stopPropagation();
    toggleStar(id);
  }, [toggleStar]);

  const handleMarkAllRead = useCallback(() => {
    if (filterType === 'feed' && filterId) {
      markAllRead(filterId);
    } else {
      markAllRead();
    }
  }, [filterType, filterId, markAllRead]);

  const handleNextItem = useCallback(() => {
    if (selectedIndex < filteredItems.length - 1) {
      const nextIndex = selectedIndex + 1;
      setSelectedIndex(nextIndex);
      if (viewMode === ViewMode.Detail) {
        handleOpenItem(filteredItems[nextIndex].id);
      }
    }
  }, [selectedIndex, filteredItems, viewMode, handleOpenItem]);

  const handlePrevItem = useCallback(() => {
    if (selectedIndex > 0) {
      const prevIndex = selectedIndex - 1;
      setSelectedIndex(prevIndex);
      if (viewMode === ViewMode.Detail) {
        handleOpenItem(filteredItems[prevIndex].id);
      }
    }
  }, [selectedIndex, filteredItems, viewMode, handleOpenItem]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const currentItem = filteredItems[selectedIndex];

      switch (e.key.toLowerCase()) {
        case 'j':
          e.preventDefault();
          handleNextItem();
          break;
        case 'k':
          e.preventDefault();
          handlePrevItem();
          break;
        case 'm':
          e.preventDefault();
          if (currentItem) {
            markAsRead(currentItem.id, !currentItem.isRead);
          }
          break;
        case 's':
          e.preventDefault();
          if (currentItem) {
            handleToggleStar(null, currentItem.id);
          }
          break;
        case 'v':
          e.preventDefault();
          if (currentItem) window.open(currentItem.url, '_blank');
          break;
        case 'enter':
        case 'o':
          e.preventDefault();
          if (currentItem) {
            handleOpenItem(currentItem.id);
          }
          break;
        case 'escape':
          if (viewMode === ViewMode.Detail) {
            handleBackToList();
          }
          break;
        case '1':
          setViewMode(ViewMode.List);
          break;
        case '2':
          setViewMode(ViewMode.Expanded);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, filteredItems, viewMode, handleOpenItem, handleToggleStar, handleNextItem, handlePrevItem, handleBackToList, markAsRead]);

  // Reset selection on filter change
  useEffect(() => {
    setSelectedIndex(0);
    setExpandedId(null);
    if (viewMode === ViewMode.Detail) setViewMode(ViewMode.List);
  }, [filterType, filterId]);

  const isPodcastFeed = useMemo(() => {
    if (filterType !== 'feed' || !filterId) return false;
    return filteredItems.some(item => item.mediaType === 'audio' && item.audioUrl);
  }, [filterType, filterId, filteredItems]);

  const handleBatchScanComplete = async (results: Array<{
    title: string;
    content: string;
    metadata: { pageCount: number; fileSizeMB: number; processingTimeMs: number };
    fileName: string;
  }>) => {
    for (const result of results) {
      await saveScannedDocument(result.title, result.content, result.metadata);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-cream text-ink font-sans overflow-hidden">
      <Sidebar
        folders={folders}
        feeds={feeds}
        items={items}
        activeFilter={filterType}
        activeId={filterId}
        onNavigate={(type, id) => {
          setFilterType(type);
          if (id) setFilterId(id);
          else setFilterId(null);
        }}
        onSubscribe={() => setSubscribeOpen(true)}
        onUnsubscribe={(feedId) => unsubscribe(feedId, true)}
        onScanPdf={() => setScanOpen(true)}
        onFolderScan={() => setFolderScanOpen(true)}
        documentCount={documentCount}
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-col flex-grow h-full overflow-hidden relative">
        <Header
          viewMode={viewMode}
          onSetViewMode={(mode) => {
            setViewMode(mode);
            if (mode === ViewMode.List) setExpandedId(null);
          }}
          onMarkAllRead={handleMarkAllRead}
          onRefresh={refreshFeeds}
          unreadCount={filteredItems.filter(i => !i.isRead).length}
          showBulkTranscribe={isPodcastFeed}
          onBulkTranscribe={() => setBulkTranscribeOpen(true)}
          sortOrder={sortOrder}
          onSortChange={setSortOrder}
          onOpenSidebar={() => setSidebarOpen(true)}
          isMobile={isMobile}
        />

        {error && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-grow flex items-center justify-center text-gray-500">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 border-4 border-reader-active border-t-transparent rounded-full animate-spin mb-4"></div>
              Loading...
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="text-gray-500 text-center">
              <p className="mb-4 text-lg">No items to display.</p>
              {feeds.length === 0 && (
                <button
                  onClick={() => setSubscribeOpen(true)}
                  className="bg-reader-active text-white px-6 py-2 rounded-full font-medium shadow-sm hover:shadow-md transition-all"
                >
                  Add your first feed
                </button>
              )}
            </div>
          </div>
        ) : (
          <FeedList
            items={filteredItems}
            feeds={feeds}
            selectedIndex={selectedIndex}
            expandedId={expandedId}
            onSelectItem={handleSelectItem}
            onOpenItem={handleOpenItem}
            onBackToList={handleBackToList}
            onToggleStar={handleToggleStar}
            onNextItem={handleNextItem}
            onPrevItem={handlePrevItem}
            viewMode={viewMode}
            onTranscribe={transcribeItem}
            hasTranscriptionKey={hasTranscriptionKey}
            setTranscriptionKey={setTranscriptionKey}
            onUpdateSummary={updateSummary}
          />
        )}
      </div>

      <SubscribeModal
        isOpen={isSubscribeOpen}
        onClose={() => {
          setSubscribeOpen(false);
          setSubscribeError(null);
        }}
        onSubscribe={handleSubscribe}
        onImportVideo={handleImportVideo}
        error={subscribeError}
      />

      <ScanModal
        isOpen={isScanOpen}
        onClose={() => setScanOpen(false)}
        onScanComplete={saveScannedDocument}
      />

      <FolderScanModal
        isOpen={isFolderScanOpen}
        onClose={() => setFolderScanOpen(false)}
        onScanComplete={handleBatchScanComplete}
      />

      <BulkTranscribeModal
        isOpen={isBulkTranscribeOpen}
        onClose={() => setBulkTranscribeOpen(false)}
        items={filteredItems}
        feedTitle={filterId ? feeds.find(f => f.id === filterId)?.name : undefined}
      />
    </div>
  );
}

/**
 * Local storage wrapper - uses IndexedDB via useStorage hook
 */
function LocalApp() {
  const storage = useStorage();
  return <AppContent storage={storage} />;
}

/**
 * Convex storage wrapper - uses Convex cloud storage
 * Must be rendered inside ConvexStorageProvider
 */
function ConvexApp() {
  const storage = useConvexStorageHook();
  return <AppContent storage={storage} />;
}

/**
 * Main App component - chooses storage backend based on storageMode prop
 */
function App({ storageMode = 'local' }: AppProps) {
  if (storageMode === 'convex') {
    // Convex mode requires the ConvexStorageProvider wrapper
    return (
      <ConvexStorageProvider>
        <ConvexApp />
      </ConvexStorageProvider>
    );
  }

  // Default: local IndexedDB storage
  return <LocalApp />;
}

export default App;
