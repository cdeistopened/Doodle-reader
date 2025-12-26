import React, { useEffect, useRef, useState } from 'react';
import { FeedItem, ViewMode, FeedSource } from '../types';
import { Star, ExternalLink, Loader2, Share2, CheckCircle2, Download, Youtube, ArrowLeft, ChevronLeft, ChevronRight, FileText, PenTool, Clock, Check, Key, Mic, ChevronDown, ChevronUp, Edit3, Copy, Sparkles, X, Zap } from 'lucide-react';
import { getTranscript } from '../lib/youtube';
import { TransformPanel } from './TransformPanel';
import ReactMarkdown from 'react-markdown';
import type { TranscriptionProgress } from '../lib/transcribe';
import type { TranscriptionProvider } from '../lib/hooks/useStorage';

// Format duration (handles both raw seconds "2652" and formatted "44:12")
function formatDuration(duration: string | undefined): string {
  if (!duration) return '';

  // If it's just a number (seconds), convert to HH:MM:SS or MM:SS
  if (/^\d+$/.test(duration)) {
    const totalSeconds = parseInt(duration, 10);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Already formatted, return as-is
  return duration;
}

interface FeedListProps {
  items: FeedItem[];
  feeds: FeedSource[];
  selectedIndex: number;
  expandedId: string | null;
  onSelectItem: (index: number) => void;
  onOpenItem: (id: string) => void;
  onBackToList: () => void;
  onToggleStar: (e: React.MouseEvent, id: string) => void;
  onNextItem: () => void;
  onPrevItem: () => void;
  viewMode: ViewMode;
  onTranscribe?: (itemId: string, onProgress?: (progress: TranscriptionProgress) => void, provider?: TranscriptionProvider) => Promise<void>;
  hasTranscriptionKey?: (provider?: TranscriptionProvider) => boolean;
  setTranscriptionKey?: (key: string) => void;
  onUpdateSummary?: (itemId: string, summary: string) => Promise<void>;
}

export const FeedList: React.FC<FeedListProps> = ({
  items,
  feeds,
  selectedIndex,
  expandedId,
  onSelectItem,
  onOpenItem,
  onBackToList,
  onToggleStar,
  onNextItem,
  onPrevItem,
  viewMode,
  onTranscribe,
  hasTranscriptionKey,
  setTranscriptionKey,
  onUpdateSummary,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcribeProgress, setTranscribeProgress] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  
  // Transcription provider - default to Gemini (faster, cheaper, better speaker ID)
  const [transcriptionProvider, setTranscriptionProvider] = useState<TranscriptionProvider>(() => {
    const saved = localStorage.getItem('transcription_provider');
    return (saved as TranscriptionProvider) || 'gemini';
  });
  
  // Persist provider choice
  const handleProviderChange = (provider: TranscriptionProvider) => {
    setTranscriptionProvider(provider);
    localStorage.setItem('transcription_provider', provider);
  };

  const handleTranscribe = async (itemId: string, provider?: TranscriptionProvider) => {
    if (!onTranscribe) return;
    
    const useProvider = provider || transcriptionProvider;

    // Check for API key based on provider
    if (hasTranscriptionKey && !hasTranscriptionKey(useProvider)) {
      setShowApiKeyModal(true);
      return;
    }

    setTranscribingId(itemId);
    setTranscribeProgress('Starting...');

    try {
      await onTranscribe(itemId, (progress) => {
        setTranscribeProgress(progress.message);
      }, useProvider);
      setTranscribeProgress('Complete!');
    } catch (error: any) {
      alert(`Transcription failed: ${error.message}`);
    } finally {
      setTimeout(() => {
        setTranscribingId(null);
        setTranscribeProgress('');
      }, 2000);
    }
  };

  const handleSaveApiKey = () => {
    if (setTranscriptionKey && apiKeyInput.trim()) {
      setTranscriptionKey(apiKeyInput.trim());
      setShowApiKeyModal(false);
      setApiKeyInput('');
    }
  };

  // Auto-scroll logic for List/Stream views
  useEffect(() => {
    if (viewMode !== ViewMode.Detail && selectedIndex >= 0 && containerRef.current) {
      const row = containerRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (row) {
        row.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, viewMode]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return isToday ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getSourceName = (feedId: string) => {
    const feed = feeds.find(f => f.id === feedId);
    return feed ? feed.name : 'Unknown Source';
  };

  // --- DETAIL VIEW (READING MODE) ---
  if (viewMode === ViewMode.Detail && expandedId) {
    const item = items.find(i => i.id === expandedId);
    if (!item) return <div className="flex-grow flex items-center justify-center text-ink-muted">Item not found</div>;

    const sourceName = getSourceName(item.feedId);

    return (
      <div className="flex-grow flex flex-col h-full bg-cream overflow-hidden fixed md:relative inset-0 z-40 md:z-auto">
        {/* Reading Header */}
        <div className="flex items-center justify-between px-3 md:px-4 py-3 border-b border-border bg-surface flex-shrink-0">
          <div className="flex items-center gap-1 md:gap-2">
            <button
              onClick={onBackToList}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cream-warm rounded-md text-ink-muted hover:text-ink transition-colors"
              title="Back to list"
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
            </button>
            <div className="h-5 w-px bg-border mx-1 hidden md:block"></div>
            <button className="p-2 min-w-[44px] min-h-[44px] hidden md:flex items-center justify-center hover:bg-cream-warm rounded-md text-ink-muted hover:text-ink transition-colors" title="Archive">
              <CheckCircle2 size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            <span className="text-xs text-ink-muted tabular-nums mr-1 md:mr-2">
              {items.findIndex(i => i.id === expandedId) + 1} / {items.length}
            </span>
            <button
              onClick={onPrevItem}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cream-warm rounded-md text-ink-muted hover:text-ink transition-colors"
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
            <button
              onClick={onNextItem}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cream-warm rounded-md text-ink-muted hover:text-ink transition-colors"
            >
              <ChevronRight size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Content Scroll Area */}
        <div className="flex-grow overflow-y-auto p-4 md:p-8">
          <article className="max-w-3xl mx-auto">
            {/* Article Header */}
            <header className="mb-6 md:mb-8 pb-4 md:pb-6 border-b border-border">
              <h1 className="font-serif text-xl md:text-3xl font-semibold text-ink leading-tight mb-3 md:mb-4">
                {item.title}
              </h1>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-accent text-white flex items-center justify-center font-semibold text-sm uppercase select-none flex-shrink-0">
                    {(item.author || sourceName).substring(0, 1)}
                  </div>
                  <div className="min-w-0">
                    {/* Channel/Author name - linked if we have authorUrl */}
                    {item.authorUrl ? (
                      <a
                        href={item.authorUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-ink hover:text-accent transition-colors block truncate"
                      >
                        {item.author || sourceName}
                      </a>
                    ) : (
                      <div className="text-sm font-medium text-ink truncate">
                        {item.author || sourceName}
                      </div>
                    )}
                    {/* Date with open original link */}
                    <div className="text-xs text-ink-muted flex items-center gap-2 flex-wrap">
                      <span>
                        {new Date(item.timestamp).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                      <span className="text-border hidden sm:inline">•</span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-accent transition-colors flex items-center gap-1"
                      >
                        <ExternalLink size={10} strokeWidth={1.5} />
                        <span className="hidden sm:inline">Open original</span>
                        <span className="sm:hidden">Original</span>
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 -ml-2 sm:ml-0">
                  <button
                    onClick={(e) => onToggleStar(e, item.id)}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cream-warm rounded-md transition-colors"
                  >
                    <Star
                      size={20}
                      strokeWidth={1.5}
                      className={item.isStarred ? 'fill-status-warning text-status-warning' : 'text-ink-muted hover:text-ink'}
                    />
                  </button>
                  <button className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cream-warm rounded-md transition-colors">
                    <Share2 size={20} strokeWidth={1.5} className="text-ink-muted hover:text-ink" />
                  </button>
                </div>
              </div>
            </header>

            {/* Body */}
            <ExpandedCard
              item={item}
              sourceName={sourceName}
              onToggleStar={onToggleStar}
              onTranscribe={(id, provider) => handleTranscribe(id, provider)}
              isTranscribing={transcribingId === item.id}
              onUpdateSummary={onUpdateSummary}
              transcriptionProvider={transcriptionProvider}
              onProviderChange={handleProviderChange}
            />
          </article>
        </div>
      </div>
    );
  }

  // --- STREAM VIEW (Card Grid) ---
  if (viewMode === ViewMode.Expanded) {
    return (
      <div className="flex-grow overflow-y-auto bg-cream p-6" ref={containerRef}>
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          {items.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <article
                key={item.id}
                data-index={index}
                onClick={() => onSelectItem(index)}
                className={`
                  bg-surface border-2 rounded-lg p-6 cursor-pointer transition-all
                  ${isSelected ? 'border-accent shadow-brutal-sm' : 'border-border hover:border-ink'}
                `}
              >
                <ExpandedCard
                  item={item}
                  sourceName={getSourceName(item.feedId)}
                  onToggleStar={onToggleStar}
                  onTranscribe={(id, provider) => handleTranscribe(id, provider)}
                  isTranscribing={transcribingId === item.id}
                  onUpdateSummary={onUpdateSummary}
                  transcriptionProvider={transcriptionProvider}
                  onProviderChange={handleProviderChange}
                />
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  // --- INBOX VIEW (List) ---
  return (
    <div className="flex-grow overflow-y-auto bg-surface" ref={containerRef}>
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isRead = item.isRead;
        const sourceName = getSourceName(item.feedId);
        const isVideo = item.mediaType === 'video' || (item.url && (item.url.includes('youtube.com') || item.url.includes('youtu.be')));
        const isPodcast = item.mediaType === 'audio' || !!item.audioUrl;
        const isTranscribed = item.transcriptionStatus === 'complete';

        return (
          <div
            key={item.id}
            data-index={index}
            onClick={() => {
              onSelectItem(index);
              onOpenItem(item.id);
            }}
            className={`
              px-3 md:px-4 py-3 cursor-pointer border-b border-border-muted relative group transition-colors min-h-[60px] md:min-h-0
              ${isSelected ? 'bg-accent-soft' : 'hover:bg-cream'}
              ${!isRead ? 'bg-surface' : 'bg-surface-sunken'}
            `}
          >
            {/* Mobile Layout */}
            <div className="flex md:hidden items-start gap-3">
              {/* Star - larger tap target on mobile */}
              <div
                className="flex-shrink-0 p-1 -m-1"
                onClick={(e) => onToggleStar(e, item.id)}
              >
                <Star
                  size={18}
                  strokeWidth={1.5}
                  className={`transition-all cursor-pointer ${item.isStarred ? 'fill-status-warning text-status-warning' : 'text-border'}`}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {/* Type Icon */}
                  {isVideo && <Youtube size={12} className="text-status-error flex-shrink-0" strokeWidth={1.5} />}
                  {isPodcast && (
                    isTranscribed
                      ? <Check size={12} className="text-status-success flex-shrink-0" strokeWidth={2} />
                      : <PenTool size={12} className="text-accent flex-shrink-0" strokeWidth={1.5} />
                  )}
                  {/* Title */}
                  <span className={`truncate text-sm leading-tight ${!isRead ? 'text-ink font-medium' : 'text-ink-soft'}`}>
                    {item.title || '(No Title)'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="truncate">{sourceName}</span>
                  <span>•</span>
                  <span className="flex-shrink-0 tabular-nums">{formatTime(item.timestamp)}</span>
                  {isPodcast && item.duration && (
                    <>
                      <span>•</span>
                      <span className="flex items-center flex-shrink-0">
                        <Clock size={10} className="mr-0.5" strokeWidth={1.5} />
                        {formatDuration(item.duration)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex items-center">
              {/* Star */}
              <div
                className="w-8 flex-shrink-0 flex items-center justify-center mr-2"
                onClick={(e) => onToggleStar(e, item.id)}
              >
                <Star
                  size={16}
                  strokeWidth={1.5}
                  className={`transition-all cursor-pointer ${item.isStarred ? 'fill-status-warning text-status-warning' : 'text-border hover:text-ink-muted'}`}
                />
              </div>

              {/* Type Icon */}
              <div className="w-6 flex-shrink-0 flex items-center justify-center mr-3">
                {isVideo && <Youtube size={14} className="text-status-error" strokeWidth={1.5} />}
                {isPodcast && (
                  isTranscribed
                    ? <Check size={14} className="text-status-success" strokeWidth={2} />
                    : <PenTool size={14} className="text-accent" strokeWidth={1.5} />
                )}
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0 mr-4">
                <span className={`block truncate text-sm ${!isRead ? 'text-ink font-medium' : 'text-ink-soft'}`}>
                  {item.title || '(No Title)'}
                </span>
              </div>

              {/* Source */}
              <div className={`w-32 flex-shrink-0 truncate text-xs mr-4 ${!isRead ? 'text-ink-muted font-medium' : 'text-ink-muted'}`}>
                {sourceName}
              </div>

              {/* Snippet (hidden on small screens) */}
              <div className="flex-1 min-w-0 truncate text-ink-muted text-xs hidden xl:block mr-4">
                {isPodcast && item.duration ? (
                  <span className="flex items-center">
                    <Clock size={10} className="mr-1" strokeWidth={1.5} />
                    {formatDuration(item.duration)}
                  </span>
                ) : (
                  item.snippet
                )}
              </div>

              {/* Date */}
              <div className={`w-16 flex-shrink-0 text-right text-xs tabular-nums ${!isRead ? 'text-ink-muted font-medium' : 'text-ink-muted'}`}>
                {formatTime(item.timestamp)}
              </div>
            </div>

            {/* Hover Actions - desktop only */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-surface border border-border rounded-md px-1 py-0.5 hidden group-hover:md:flex items-center gap-0.5 shadow-soft">
              {isPodcast && !isTranscribed && item.transcriptionStatus !== 'processing' && item.transcriptionStatus !== 'pending' && (
                <button
                  className="p-1.5 hover:bg-accent-soft rounded text-accent"
                  title="Transcribe"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTranscribe(item.id);
                  }}
                  disabled={transcribingId === item.id}
                >
                  {transcribingId === item.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Mic size={14} strokeWidth={1.5} />
                  )}
                </button>
              )}
              {(item.transcriptionStatus === 'processing' || item.transcriptionStatus === 'pending') && (
                <span className="text-xs text-accent px-2 flex items-center">
                  <Loader2 size={12} className="animate-spin mr-1" />
                  {transcribingId === item.id ? transcribeProgress : 'Processing...'}
                </span>
              )}
              <button className="p-1.5 hover:bg-cream-dark rounded text-ink-muted" title="Archive">
                <CheckCircle2 size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        );
      })}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-surface border-2 border-ink rounded-lg shadow-brutal w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Key size={20} className="text-accent" strokeWidth={1.5} />
                <h2 className="font-serif text-lg font-semibold text-ink">API Key Required</h2>
              </div>
            </div>
            <div className="p-5">
              <p className="text-ink-muted text-sm mb-4">
                {transcriptionProvider === 'gemini' ? (
                  <>
                    To transcribe podcasts with Gemini, you need a Google AI API key.
                    Get one free at{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-muted underline">
                      aistudio.google.com
                    </a>
                  </>
                ) : (
                  <>
                    To transcribe podcasts with AssemblyAI, you need an API key.
                    Get one free at{' '}
                    <a href="https://www.assemblyai.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-muted underline">
                      assemblyai.com
                    </a>
                  </>
                )}
              </p>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-4 py-3 border-2 border-border rounded-md text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="px-5 py-4 bg-cream-warm border-t border-border flex justify-end gap-3">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="px-4 py-2 text-ink font-medium text-sm rounded-md border-2 border-border hover:border-ink transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-5 py-2 bg-accent text-white font-medium text-sm rounded-md border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Collapsible section component for toggleable content
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, icon, defaultOpen = false, children, badge }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-cream-warm hover:bg-cream-dark transition-colors font-sans"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          {icon}
          <span>{title}</span>
          {badge && (
            <span className="text-xs bg-accent-soft text-accent px-2 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        {isOpen ? <ChevronUp size={16} className="text-ink-muted" /> : <ChevronDown size={16} className="text-ink-muted" />}
      </button>
      {isOpen && (
        <div className="p-4 bg-surface border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
};

// Transformed output card for the outputs panel
interface TransformOutputCardProps {
  title: string;
  content: string;
  onDownload: () => void;
  onCopy: () => void;
  onClear: () => void;
}

const TransformOutputCard: React.FC<TransformOutputCardProps> = ({ title, content, onDownload, onCopy, onClear }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface border-2 border-accent rounded-lg overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-accent-soft border-b border-accent">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-accent font-semibold text-sm font-sans"
        >
          <Sparkles size={16} strokeWidth={1.5} />
          <span>{title}</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-accent/10 rounded text-accent transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            onClick={onDownload}
            className="p-1.5 hover:bg-accent/10 rounded text-accent transition-colors"
            title="Download as markdown"
          >
            <Download size={14} />
          </button>
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-status-error/10 rounded text-ink-muted hover:text-status-error transition-colors"
            title="Clear"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Card Content - Rendered Markdown */}
      {isExpanded && (
        <div className="p-5 max-h-[600px] overflow-y-auto">
          <div className="prose-polished">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component for the expanded article body
interface ExpandedCardProps {
  item: FeedItem;
  sourceName: string;
  onToggleStar: any;
  onTranscribe?: (itemId: string, provider?: TranscriptionProvider) => void;
  isTranscribing?: boolean;
  onUpdateSummary?: (itemId: string, summary: string) => Promise<void>;
  transcriptionProvider?: TranscriptionProvider;
  onProviderChange?: (provider: TranscriptionProvider) => void;
}

const ExpandedCard = ({ item, sourceName, onTranscribe, isTranscribing, onUpdateSummary, transcriptionProvider = 'gemini', onProviderChange }: ExpandedCardProps) => {
  // Transform outputs - can have multiple
  // Initialize with saved aiSummary if it exists (persists polished content across navigation)
  const [transformOutputs, setTransformOutputs] = useState<Array<{ id: string; title: string; content: string }>>(() => {
    if (item.aiSummary) {
      return [{ id: 'saved', title: 'Polished', content: item.aiSummary }];
    }
    return [];
  });
  const [rawTranscript, setRawTranscript] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Toggle states
  const [showTranscript, setShowTranscript] = useState(true); // Default open for videos
  const [showDescription, setShowDescription] = useState(false);

  // Sync transformOutputs when item changes (e.g., navigating between items)
  useEffect(() => {
    if (item.aiSummary) {
      setTransformOutputs([{ id: 'saved', title: 'Polished', content: item.aiSummary }]);
    } else {
      setTransformOutputs([]);
    }
    // Reset other state when item changes
    setRawTranscript(null);
    setFetchError(null);
  }, [item.id, item.aiSummary]);

  const isVideo = item.mediaType === 'video' || (item.url && (item.url.includes('youtube.com') || item.url.includes('youtu.be')));
  const isPodcast = item.mediaType === 'audio' || !!item.audioUrl;
  const isScannedDoc = item.feedId === 'scanned-documents';
  const hasTranscript = item.transcriptionStatus === 'complete' && item.content;

  const getVideoId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  const handleFetchTranscript = async () => {
    const videoId = getVideoId(item.url);
    if (!videoId) {
      setFetchError('Could not extract video ID');
      return;
    }
    setIsFetching(true);
    setFetchError(null);
    try {
      const transcript = await getTranscript(videoId);
      if (transcript) {
        setRawTranscript(transcript);
      } else {
        setFetchError('No captions available');
      }
    } catch (error: any) {
      setFetchError(error.message || 'Failed to fetch transcript');
    } finally {
      setIsFetching(false);
    }
  };

  const handleSaveMarkdown = (content: string, filename: string) => {
    const markdown = `# ${item.title}\n\n**Source:** ${sourceName}\n**URL:** ${item.url}\n**Date:** ${new Date(item.timestamp).toLocaleString()}\n\n---\n\n${content}`;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleTransformResult = async (result: { output: string }, transform?: any) => {
    const newOutput = {
      id: Date.now().toString(),
      title: transform?.name || 'Polished',
      content: result.output,
    };
    setTransformOutputs(prev => [...prev, newOutput]);
    // Use the hook's updateSummary to persist AND update React state
    if (onUpdateSummary) {
      await onUpdateSummary(item.id, result.output);
    }
  };

  const handleRemoveOutput = (id: string) => {
    setTransformOutputs(prev => prev.filter(o => o.id !== id));
  };

  const videoId = isVideo ? getVideoId(item.url) : null;
  const origin = window.location.origin;

  // Determine content type for TransformPanel
  const getContentType = () => {
    if (isVideo || isPodcast) return 'transcript';
    return 'article';
  };

  const getContentToTransform = () => {
    if (isVideo) return rawTranscript;
    if (isPodcast && hasTranscript) return item.content;
    if (!isVideo && !isPodcast) return (item.content || '') + '\n' + (item.snippet || '');
    return null;
  };

  const contentType = getContentType();
  const contentToTransform = getContentToTransform();
  const hasDescription = item.snippet && item.snippet.length > 20;

  return (
    <div className="font-serif text-ink">

      {/* Actions Bar */}
      <div className="mb-6">
        <button
          onClick={() => handleSaveMarkdown(item.content || item.snippet || '', `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`)}
          className="text-ink-muted hover:text-ink text-sm flex items-center gap-1.5 transition-colors font-sans"
        >
          <Download size={14} strokeWidth={1.5} /> Export .md
        </button>
      </div>

      {/* YouTube Embed */}
      {videoId && (
        <div className="mb-6 relative pb-[56.25%] h-0 rounded-lg overflow-hidden bg-ink">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?modestbranding=1&rel=0&origin=${origin}`}
            className="absolute top-0 left-0 w-full h-full"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            title="YouTube Video"
          />
        </div>
      )}

      {/* Podcast Audio Player */}
      {isPodcast && item.audioUrl && (
        <div className="mb-6 bg-cream-warm border-2 border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-accent rounded-md flex items-center justify-center flex-shrink-0">
              <Mic size={18} className="text-white" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink font-sans">Podcast Episode</p>
              {item.duration && (
                <p className="text-xs text-ink-muted font-sans flex items-center gap-1">
                  <Clock size={10} strokeWidth={1.5} />
                  {formatDuration(item.duration)}
                </p>
              )}
            </div>
          </div>
          <audio controls className="w-full h-10" preload="metadata">
            <source src={item.audioUrl} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {/* Podcast Transcription Status/Action */}
      {isPodcast && !hasTranscript && (
        <div className="mb-6 bg-surface border-2 border-ink rounded-lg p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink font-sans mb-1">
                {isTranscribing || item.transcriptionStatus === 'processing' || item.transcriptionStatus === 'pending'
                  ? 'Transcribing...'
                  : 'Transcription Required'}
              </p>
              <p className="text-xs text-ink-muted font-sans">
                {isTranscribing || item.transcriptionStatus === 'processing' || item.transcriptionStatus === 'pending'
                  ? 'This may take a few minutes depending on episode length.'
                  : 'Transcribe this episode to unlock Polish, Summarize, and Key Points.'}
              </p>
            </div>
            {isTranscribing || item.transcriptionStatus === 'processing' || item.transcriptionStatus === 'pending' ? (
              <div className="flex items-center gap-2 text-accent font-sans flex-shrink-0">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Provider Toggle */}
                <div className="flex items-center bg-cream-warm rounded-md border border-border p-0.5">
                  <button
                    onClick={() => onProviderChange?.('gemini')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-all ${
                      transcriptionProvider === 'gemini'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                    title="Gemini 3 Flash - Fast, cheap, identifies speakers by name"
                  >
                    <Zap size={12} strokeWidth={2} />
                    <span>Gemini</span>
                  </button>
                  <button
                    onClick={() => onProviderChange?.('assemblyai')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-all ${
                      transcriptionProvider === 'assemblyai'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                    title="AssemblyAI - Traditional, reliable"
                  >
                    <Mic size={12} strokeWidth={2} />
                    <span>Assembly</span>
                  </button>
                </div>
                <button
                  onClick={() => onTranscribe?.(item.id, transcriptionProvider)}
                  disabled={!onTranscribe}
                  className="flex items-center gap-2 text-sm font-medium text-white bg-accent hover:bg-accent-muted border-2 border-ink px-4 py-2.5 rounded-md shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mic size={16} strokeWidth={1.5} />
                  <span>Transcribe</span>
                </button>
              </div>
            )}
          </div>
          {/* Provider info */}
          {!(isTranscribing || item.transcriptionStatus === 'processing' || item.transcriptionStatus === 'pending') && (
            <p className="text-xs text-ink-muted mt-3 font-sans">
              {transcriptionProvider === 'gemini' 
                ? '⚡ Gemini: ~50x cheaper, identifies speakers by name' 
                : '🎙️ AssemblyAI: Traditional, reliable transcription'}
            </p>
          )}
          {item.transcriptionStatus === 'error' && (
            <p className="text-xs text-status-error mt-3 font-sans">Transcription failed. Try again.</p>
          )}
        </div>
      )}

      {/* YouTube: Fetch Transcript */}
      {isVideo && !rawTranscript && (
        <div className="mb-6 bg-surface border-2 border-ink rounded-lg p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink font-sans mb-1">
                {isFetching ? 'Fetching Transcript...' : 'Transcript Available'}
              </p>
              <p className="text-xs text-ink-muted font-sans">
                {isFetching ? 'Retrieving captions from YouTube.' : 'Fetch the transcript to unlock Polish, Summarize, and Key Points.'}
              </p>
              {fetchError && <p className="text-xs text-status-error mt-2 font-sans">{fetchError}</p>}
            </div>
            {isFetching ? (
              <Loader2 size={20} className="animate-spin text-accent" />
            ) : (
              <button
                onClick={handleFetchTranscript}
                className="flex items-center gap-2 text-sm font-medium text-white bg-accent hover:bg-accent-muted border-2 border-ink px-4 py-2.5 rounded-md shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all font-sans flex-shrink-0"
              >
                <Youtube size={16} strokeWidth={1.5} />
                <span>Fetch Transcript</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* === MAIN CONTENT AREA === */}
      <div className="space-y-4">

        {/* Description Toggle (for videos/podcasts) */}
        {(isVideo || isPodcast) && hasDescription && (
          <CollapsibleSection
            title="Description"
            icon={<FileText size={14} strokeWidth={1.5} />}
            defaultOpen={showDescription}
          >
            <p className="text-sm text-ink-soft leading-relaxed font-sans">{item.snippet}</p>
          </CollapsibleSection>
        )}

        {/* Raw Transcript Toggle (for videos with fetched transcript or podcasts with transcription) */}
        {((isVideo && rawTranscript) || (isPodcast && hasTranscript)) && (
          <CollapsibleSection
            title="Raw Transcript"
            icon={<PenTool size={14} strokeWidth={1.5} />}
            defaultOpen={showTranscript}
            badge={`${((isVideo ? rawTranscript : item.content) || '').length.toLocaleString()} chars`}
          >
            <pre className="text-sm text-ink-muted whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
              {isVideo ? rawTranscript : item.content}
            </pre>
          </CollapsibleSection>
        )}

        {/* Transform Panel - Just buttons when we have content */}
        {contentToTransform && (
          <div className="bg-cream-warm border-2 border-ink rounded-lg p-4">
            <p className="text-xs text-ink-muted uppercase tracking-wide font-semibold mb-3 font-sans flex items-center gap-2">
              <Sparkles size={12} strokeWidth={2} />
              Transform
            </p>
            <TransformPanel
              content={contentToTransform}
              contentType={contentType}
              title={item.title}
              onResult={handleTransformResult}
              compact={true}
            />
          </div>
        )}

        {/* === TRANSFORMED OUTPUTS PANEL === */}
        {transformOutputs.length > 0 && (
          <div className="mt-6 pt-6 border-t-2 border-accent">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-accent mb-4 font-sans flex items-center gap-2">
              <Sparkles size={14} strokeWidth={2} />
              Transformed Outputs
              <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full">{transformOutputs.length}</span>
            </h3>
            <div className="space-y-4">
              {transformOutputs.map((output) => (
                <TransformOutputCard
                  key={output.id}
                  title={output.title}
                  content={output.content}
                  onDownload={() => handleSaveMarkdown(output.content, `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${output.title.toLowerCase()}.md`)}
                  onCopy={() => handleCopyToClipboard(output.content)}
                  onClear={() => handleRemoveOutput(output.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular Article Content (non-video, non-podcast) */}
        {!isVideo && !isPodcast && (
          isScannedDoc ? (
            <div className="prose-content mt-6">
              <ReactMarkdown>{item.content || item.snippet}</ReactMarkdown>
            </div>
          ) : (
            <div
              className="prose-content mt-6"
              dangerouslySetInnerHTML={{ __html: item.content || item.snippet }}
            />
          )
        )}
      </div>
    </div>
  );
}