import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Link2, X, Rss, Youtube, Search, Check, Sparkles, Globe } from 'lucide-react';
import { discoverFeeds, type DiscoveredFeed } from '../lib/feedDiscovery';

type ImportMode = 'feed' | 'video';

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe: (url: string, onProgress?: (count: number) => void) => Promise<void>;
  onImportVideo?: (url: string) => Promise<void>;
  error?: string | null;
}

export const SubscribeModal: React.FC<SubscribeModalProps> = ({
  isOpen,
  onClose,
  onSubscribe,
  onImportVideo,
  error: externalError
}) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ImportMode>('feed');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [discoveredFeeds, setDiscoveredFeeds] = useState<DiscoveredFeed[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<DiscoveredFeed | null>(null);
  const [loadingCount, setLoadingCount] = useState(0);

  const error = externalError || internalError;

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setMode('feed');
      setDiscoveredFeeds([]);
      setSelectedFeed(null);
      setInternalError(null);
      setLoadingCount(0);
    }
  }, [isOpen]);

  // Debounced search for feed discovery
  useEffect(() => {
    if (mode !== 'feed' || !query.trim() || query.length < 3) {
      setDiscoveredFeeds([]);
      setSelectedFeed(null);
      return;
    }

    // Don't search if it looks like a complete URL (user might just want to subscribe directly)
    const looksLikeCompleteUrl = query.match(/^https?:\/\/[^\s]+\.[^\s]+/);
    if (looksLikeCompleteUrl) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearching(true);
      setInternalError(null);
      try {
        const result = await discoverFeeds(query);
        setDiscoveredFeeds(result.feeds);
        if (result.feeds.length === 1) {
          setSelectedFeed(result.feeds[0]);
        }
        if (result.error && result.feeds.length === 0) {
          // Don't show error during typing, only if explicitly searched
        }
      } catch (e) {
        console.error('Discovery error:', e);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [query, mode]);

  if (!isOpen) return null;

  // Auto-detect YouTube URLs and switch mode
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedFeed(null);
    if (value.includes('youtube.com/watch') || value.includes('youtu.be/')) {
      setMode('video');
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    setInternalError(null);
    try {
      const result = await discoverFeeds(query);
      setDiscoveredFeeds(result.feeds);
      if (result.feeds.length === 1) {
        setSelectedFeed(result.feeds[0]);
      } else if (result.feeds.length === 0) {
        setInternalError(result.error || 'No feeds found');
      }
    } catch (e: any) {
      setInternalError(e.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setInternalError(null);
    setLoadingCount(0);

    try {
      if (mode === 'video' && onImportVideo) {
        await onImportVideo(query);
      } else {
        // Use selected feed URL or the raw query
        const urlToSubscribe = selectedFeed?.url || query;
        await onSubscribe(urlToSubscribe, (count) => setLoadingCount(count));
      }
      setQuery('');
      setMode('feed');
      setDiscoveredFeeds([]);
      setSelectedFeed(null);
    } catch (err: any) {
      setInternalError(err.message || 'Could not process URL. Try checking the format.');
    } finally {
      setLoading(false);
      setLoadingCount(0);
    }
  };

  const handleSelectFeed = (feed: DiscoveredFeed) => {
    setSelectedFeed(feed);
    setQuery(feed.url);
  };

  const getSourceIcon = (source: DiscoveredFeed['source']) => {
    switch (source) {
      case 'itunes':
      case 'podcastindex':
        return <Rss size={12} className="text-purple-500" />;
      case 'feedly':
        return <Rss size={12} className="text-accent" />;
      case 'autodiscover':
        return <Globe size={12} className="text-status-success" />;
      case 'gemini':
        return <Sparkles size={12} className="text-purple-500" />;
      default:
        return <Rss size={12} className="text-ink-muted" />;
    }
  };

  const getSourceLabel = (source: DiscoveredFeed['source']) => {
    switch (source) {
      case 'itunes':
        return 'iTunes';
      case 'podcastindex':
        return 'Podcast Index';
      case 'feedly':
        return 'Feedly';
      case 'autodiscover':
        return 'Auto-discovered';
      case 'gemini':
        return 'AI Found';
      default:
        return 'Found';
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity p-4 animate-fade-in">
      <div className="bg-surface w-full max-w-md border-2 border-ink rounded-lg shadow-brutal overflow-hidden font-sans">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-ink">
            {mode === 'video' ? 'Import Video' : 'Add Feed'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-cream-warm rounded-md transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('feed')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md border-2 text-sm font-medium transition-all ${
              mode === 'feed'
                ? 'bg-accent text-white border-ink shadow-brutal-sm'
                : 'bg-surface text-ink-muted border-border hover:border-ink hover:text-ink'
            }`}
          >
            <Rss size={16} strokeWidth={1.5} />
            Add Feed
          </button>
          <button
            type="button"
            onClick={() => setMode('video')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md border-2 text-sm font-medium transition-all ${
              mode === 'video'
                ? 'bg-accent text-white border-ink shadow-brutal-sm'
                : 'bg-surface text-ink-muted border-border hover:border-ink hover:text-ink'
            }`}
          >
            <Youtube size={16} strokeWidth={1.5} />
            One-off Video
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-5">
            <p className="text-ink-muted text-sm mb-4">
              {mode === 'video'
                ? 'Paste a YouTube video URL to import its transcript.'
                : 'Search by name or enter a URL. We\'ll find the RSS feed for you.'}
            </p>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {mode === 'video' ? (
                  <Youtube className="h-4 w-4 text-ink-muted" strokeWidth={1.5} />
                ) : searching ? (
                  <Loader2 className="h-4 w-4 text-accent animate-spin" />
                ) : (
                  <Search className="h-4 w-4 text-ink-muted" strokeWidth={1.5} />
                )}
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && mode === 'feed' && !selectedFeed && discoveredFeeds.length === 0) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder={mode === 'video'
                  ? "https://youtube.com/watch?v=..."
                  : "Paul Graham's blog, techcrunch.com, etc."}
                className="block w-full pl-10 pr-4 py-3 border-2 border-border rounded-md bg-surface text-ink placeholder-ink-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft text-sm transition-all"
                autoFocus
              />
            </div>

            {/* Discovered Feeds */}
            {mode === 'feed' && discoveredFeeds.length > 0 && (
              <div className="mt-3 border-2 border-border rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-cream-warm border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Found {discoveredFeeds.length} feed{discoveredFeeds.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {discoveredFeeds.map((feed, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectFeed(feed)}
                      className={`w-full px-3 py-2.5 text-left hover:bg-cream transition-colors flex items-start gap-3 ${
                        selectedFeed?.url === feed.url ? 'bg-accent-soft' : ''
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {selectedFeed?.url === feed.url ? (
                          <Check size={16} className="text-accent" strokeWidth={2} />
                        ) : (
                          <Rss size={16} className="text-ink-muted" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="font-medium text-sm text-ink truncate">
                          {feed.title}
                        </div>
                        <div className="text-xs text-ink-muted truncate">
                          {feed.url}
                        </div>
                        {feed.description && (
                          <div className="text-xs text-ink-muted mt-1 line-clamp-2">
                            {feed.description}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1 text-xs text-ink-muted">
                        {getSourceIcon(feed.source)}
                        <span>{getSourceLabel(feed.source)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Feed Confirmation */}
            {selectedFeed && (
              <div className="mt-3 p-3 bg-status-success/10 border-2 border-status-success/30 rounded-md">
                <div className="flex items-center gap-2 text-status-success text-sm font-medium">
                  <Check size={16} strokeWidth={2} />
                  Ready to add: {selectedFeed.title}
                </div>
              </div>
            )}

            {error && (
              <div className="text-status-error text-sm mt-3 flex items-start">
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-cream-warm border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-ink font-medium text-sm rounded-md border-2 border-border hover:border-ink hover:bg-cream transition-all"
            >
              Cancel
            </button>
            {mode === 'feed' && !selectedFeed && discoveredFeeds.length === 0 && query.trim() && (
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching}
                className="px-4 py-2 text-ink font-medium text-sm rounded-md border-2 border-border hover:border-ink hover:bg-cream transition-all flex items-center"
              >
                {searching ? (
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                ) : (
                  <Search size={14} className="mr-2" />
                )}
                Search
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-2 bg-accent text-white font-medium text-sm rounded-md border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none disabled:transform-none transition-all flex items-center"
            >
              {loading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              {loading && loadingCount > 0
                ? `Loading ${loadingCount} episodes...`
                : loading
                  ? 'Fetching feed...'
                  : mode === 'video' ? 'Import' : 'Add Feed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
