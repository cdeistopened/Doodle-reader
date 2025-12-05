import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { FeedList } from './components/FeedList';
import { Header } from './components/Header';
import { SubscribeModal } from './components/SubscribeModal';
import { FeedItem, ViewMode, FilterType, FeedSource, Folder } from './types';
import { db } from './lib/db';
import { fetchFeed } from './lib/rss';

function App() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]); 
  
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterId, setFilterId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.List); // Default to Inbox List
  
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [expandedId, setExpandedId] = useState<string | null>(null); // For Detail View
  
  const [isSubscribeOpen, setSubscribeOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize DB and load data
  useEffect(() => {
    const init = async () => {
      await db.init();
      const loadedFeeds = await db.getAllFeeds();
      const loadedItems = await db.getAllItems();
      
      setFeeds(loadedFeeds);
      setItems(loadedItems);
      setLoading(false);
    };
    init();
  }, []);

  const refreshFeeds = async () => {
    setLoading(true);
    for (const feed of feeds) {
      try {
        const { items: newItems } = await fetchFeed(feed.url);
        await db.addItems(newItems);
      } catch (e) {
        console.warn(`Failed to refresh ${feed.name}`);
      }
    }
    const freshItems = await db.getAllItems();
    setItems(freshItems);
    setLoading(false);
  };

  const handleSubscribe = async (url: string) => {
    const { source, items: initialItems } = await fetchFeed(url);
    if (feeds.find(f => f.id === source.id)) {
      alert("Already subscribed to this feed!");
      return;
    }
    await db.addFeed(source);
    await db.addItems(initialItems);

    setFeeds(prev => [...prev, source]);
    setItems(await db.getAllItems());
  };

  // Filter Logic
  const filteredItems = useMemo(() => {
    let result = items;
    if (filterType === 'starred') {
      result = items.filter(i => i.isStarred);
    } else if (filterType === 'video') {
      result = items.filter(i => i.mediaType === 'video');
    } else if (filterType === 'feed' && filterId) {
      result = items.filter(i => i.feedId === filterId);
    } 
    return result;
  }, [items, filterType, filterId]);

  // Actions
  const handleOpenItem = useCallback((id: string) => {
    setExpandedId(id);
    if (viewMode === ViewMode.List) {
       setViewMode(ViewMode.Detail);
    }
    
    // Mark as read
    const item = items.find(i => i.id === id);
    if (item && !item.isRead) {
      const newItem = { ...item, isRead: true };
      setItems(prev => prev.map(i => i.id === item.id ? newItem : i));
      db.markAsRead(item.id, true);
    }
  }, [items, viewMode]);

  const handleBackToList = useCallback(() => {
    setViewMode(ViewMode.List);
    setExpandedId(null);
  }, []);

  const handleSelectItem = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleToggleStar = useCallback((e: React.MouseEvent | null, id: string) => {
    if (e) e.stopPropagation();
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    const newItem = { ...item, isStarred: !item.isStarred };
    setItems(prev => prev.map(i => i.id === id ? newItem : i));
    db.toggleStar(id);
  }, [items]);

  const handleMarkAllRead = useCallback(() => {
    const ids = new Set(filteredItems.map(i => i.id));
    setItems(prev => prev.map(i => ids.has(i.id) ? { ...i, isRead: true } : i));
    db.markAllRead(filterType === 'feed' ? filterId! : undefined);
  }, [filteredItems, filterType, filterId]);

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
        case 'j': // Next
          e.preventDefault();
          handleNextItem();
          break;
        case 'k': // Previous
          e.preventDefault();
          handlePrevItem();
          break;
        case 'm': // Toggle Read
          e.preventDefault();
          if (currentItem) {
             const updated = { ...currentItem, isRead: !currentItem.isRead };
             setItems(prev => prev.map(i => i.id === currentItem.id ? updated : i));
             db.markAsRead(currentItem.id, updated.isRead);
          }
          break;
        case 's': // Toggle Star
          e.preventDefault();
          if (currentItem) {
            handleToggleStar(null, currentItem.id);
          }
          break;
        case 'v': // View Original
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
  }, [selectedIndex, filteredItems, viewMode, handleOpenItem, handleToggleStar, handleMarkAllRead, handleNextItem, handlePrevItem, handleBackToList]);

  // Reset selection on filter change
  useEffect(() => {
    setSelectedIndex(0);
    setExpandedId(null);
    if (viewMode === ViewMode.Detail) setViewMode(ViewMode.List);
  }, [filterType, filterId]);

  return (
    <div className="flex h-screen w-screen bg-reader-bg text-reader-text font-sans overflow-hidden">
      
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
        />
        
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
          />
        )}
      </div>

      <SubscribeModal 
        isOpen={isSubscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        onSubscribe={handleSubscribe}
      />
    </div>
  );
}

export default App;