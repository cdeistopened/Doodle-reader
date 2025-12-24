import React, { useEffect, useRef, useState } from 'react';
import { FeedItem, ViewMode, FeedSource } from '../types';
import { Star, ExternalLink, Sparkles, Loader2, Share2, Mail, CheckCircle2, Download, Youtube, ArrowLeft, ChevronLeft, ChevronRight, Printer, FileText, PenTool, Clock, Check, Key, Mic } from 'lucide-react';
import { generateArticleSummary } from '../lib/ai';
import { polishTranscript } from '../lib/polish';
import { getTranscript } from '../lib/youtube';
import { storage } from '../lib/storage';
import type { TranscriptionProgress } from '../lib/transcribe';

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
  onTranscribe?: (itemId: string, onProgress?: (progress: TranscriptionProgress) => void) => Promise<void>;
  hasTranscriptionKey?: () => boolean;
  setTranscriptionKey?: (key: string) => void;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcribeProgress, setTranscribeProgress] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  const handleTranscribe = async (itemId: string) => {
    if (!onTranscribe) return;

    // Check for API key
    if (hasTranscriptionKey && !hasTranscriptionKey()) {
      setShowApiKeyModal(true);
      return;
    }

    setTranscribingId(itemId);
    setTranscribeProgress('Starting...');

    try {
      await onTranscribe(itemId, (progress) => {
        setTranscribeProgress(progress.message);
      });
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
    if (!item) return <div>Item not found</div>;

    const sourceName = getSourceName(item.feedId);
    const feed = feeds.find(f => f.id === item.feedId);
    const domain = feed?.siteUrl ? new URL(feed.siteUrl).hostname : '';

    return (
      <div className="flex-grow flex flex-col h-full bg-white rounded-tl-2xl rounded-bl-2xl shadow-sm overflow-hidden border border-gray-200/50 ml-2 mt-2 mb-2 mr-2">
         {/* Detail Header */}
         <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center space-x-4">
               <button onClick={onBackToList} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors" title="Back to Inbox">
                  <ArrowLeft size={20} />
               </button>
               <div className="h-6 w-[1px] bg-gray-200"></div>
               <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors" title="Archive">
                  <CheckCircle2 size={20} />
               </button>
               <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors" title="Delete">
                  <Mail size={20} />
               </button>
            </div>
            
            <div className="flex items-center space-x-2">
               <span className="text-sm text-gray-500 mr-2">
                 {items.findIndex(i => i.id === expandedId) + 1} of {items.length}
               </span>
               <button onClick={onPrevItem} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors">
                  <ChevronLeft size={20} />
               </button>
               <button onClick={onNextItem} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors">
                  <ChevronRight size={20} />
               </button>
            </div>
         </div>

         {/* Content Scroll Area */}
         <div className="flex-grow overflow-y-auto p-8 bg-white">
            <div className="max-w-4xl mx-auto">
               {/* Email-like Subject Header */}
               <div className="mb-8">
                  <div className="flex items-start justify-between mb-4">
                     <h1 className="text-[22px] leading-snug font-normal text-black font-sans">{item.title}</h1>
                     <div className="flex-shrink-0 ml-4">
                        <button className="bg-gray-100 hover:bg-gray-200 text-xs font-medium px-2 py-1 rounded text-gray-600">
                           Inbox
                        </button>
                     </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                     <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-reader-blue text-white flex items-center justify-center font-bold text-lg uppercase mr-3 select-none">
                           {sourceName.substring(0, 1)}
                        </div>
                        <div>
                           <div className="text-sm font-bold text-black flex items-center">
                              {items.find(i => i.id === expandedId)?.author || sourceName}
                           </div>
                           <div className="text-xs text-gray-500">
                              to me
                           </div>
                        </div>
                     </div>
                     <div className="text-xs text-gray-500 flex items-center space-x-3">
                        <span>{new Date(item.timestamp).toLocaleString()}</span>
                        <button onClick={(e) => onToggleStar(e, item.id)}>
                           <Star size={18} className={item.isStarred ? 'fill-reader-yellow text-reader-yellow' : 'text-gray-400 hover:text-gray-600'} />
                        </button>
                        <button>
                           <Share2 size={18} className="text-gray-400 hover:text-gray-600" />
                        </button>
                     </div>
                  </div>
               </div>

               {/* Body */}
               <div className="mt-8">
                  <ExpandedCard item={item} sourceName={sourceName} onToggleStar={onToggleStar} />
               </div>
            </div>
         </div>
      </div>
    );
  }

  // --- STREAM VIEW (Classic Reader) ---
  if (viewMode === ViewMode.Expanded) {
    return (
      <div className="flex-grow overflow-y-auto bg-reader-bg p-4" ref={containerRef}>
        <div className="max-w-3xl mx-auto space-y-4 pb-20">
          {items.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div 
                key={item.id} 
                data-index={index}
                onClick={() => onSelectItem(index)}
                className={`
                  bg-white rounded-xl border border-gray-200 shadow-sm
                  ${isSelected ? 'ring-2 ring-reader-active ring-offset-2' : ''}
                `}
              >
                 <div className="p-6">
                    <ExpandedCard item={item} sourceName={getSourceName(item.feedId)} onToggleStar={onToggleStar} />
                 </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- INBOX VIEW (Gmail List) ---
  return (
    <div className="flex-grow overflow-y-auto bg-reader-surface rounded-tl-2xl rounded-tr-2xl mx-0 sm:mx-2 mt-0 border border-gray-200/50 shadow-sm" ref={containerRef}>
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isRead = item.isRead;
        const sourceName = getSourceName(item.feedId);
        // Detect content types
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
              flex items-center px-4 py-2.5 cursor-pointer border-b border-gray-100 hover:shadow-sm z-0 relative group
              ${isSelected ? 'bg-reader-select/40' : 'hover:bg-gray-50'}
              ${!isRead ? 'bg-white font-bold' : 'bg-white/50 font-normal'}
            `}
          >
            {/* Drag Handle / Checkbox Area */}
            <div className="w-10 flex-shrink-0 flex items-center justify-center text-gray-300">
               <div className="w-4 h-4 border-2 border-gray-300 rounded-sm hover:border-gray-500"></div>
            </div>

            {/* Star */}
            <div className="w-8 flex-shrink-0 flex items-center justify-center mr-2" onClick={(e) => onToggleStar(e, item.id)}>
               <Star
                  size={18}
                  className={`transition-all ${item.isStarred ? 'fill-reader-yellow text-reader-yellow' : 'text-gray-300 hover:text-gray-500'}`}
               />
            </div>

            {/* Title Column (Dominant, First) */}
            <div className="flex-[5] min-w-0 flex items-center pr-4">
               {isVideo && <Youtube size={16} className="mr-2 text-red-600 flex-shrink-0" />}
               {isPodcast && (
                 <div className="flex items-center mr-2 flex-shrink-0">
                   {isTranscribed ? (
                     <Check size={16} className="text-green-600" />
                   ) : (
                     <PenTool size={16} className="text-purple-600" />
                   )}
                 </div>
               )}
               <span className={`truncate text-[15px] ${!isRead ? 'text-black font-bold' : 'text-black font-normal'}`}>
                  {item.title || '(No Title)'}
               </span>
            </div>

            {/* Source Column (Secondary, Second) */}
             <div className={`flex-[1.5] min-w-[120px] max-w-[180px] truncate text-[14px] ${!isRead ? 'text-gray-900 font-medium' : 'text-gray-500 font-normal'} mr-4`}>
               {sourceName}
            </div>

            {/* Duration for podcasts, Snippet for articles */}
            <div className="flex-[3] min-w-0 truncate text-gray-400 text-[14px] hidden xl:block mr-4">
               {isPodcast && item.duration ? (
                 <span className="flex items-center">
                   <Clock size={12} className="mr-1" />
                   {item.duration}
                 </span>
               ) : (
                 item.snippet
               )}
            </div>

            {/* Date */}
            <div className={`w-[80px] flex-shrink-0 text-right text-[12px] ml-auto ${!isRead ? 'text-black font-bold' : 'text-gray-500'}`}>
               {formatTime(item.timestamp)}
            </div>

            {/* Hover Actions (Gmail style) */}
            <div className="absolute right-4 bg-white shadow-sm border border-gray-200 rounded-r-full px-2 py-1 hidden group-hover:flex items-center space-x-1">
               {isPodcast && !isTranscribed && item.transcriptionStatus !== 'processing' && item.transcriptionStatus !== 'pending' && (
                 <button
                   className="p-1.5 hover:bg-purple-100 rounded-full text-purple-600"
                   title="Transcribe"
                   onClick={(e) => {
                     e.stopPropagation();
                     handleTranscribe(item.id);
                   }}
                   disabled={transcribingId === item.id}
                 >
                   {transcribingId === item.id ? (
                     <Loader2 size={16} className="animate-spin" />
                   ) : (
                     <Mic size={16} />
                   )}
                 </button>
               )}
               {(item.transcriptionStatus === 'processing' || item.transcriptionStatus === 'pending') && (
                 <span className="text-xs text-purple-600 px-2 flex items-center">
                   <Loader2 size={12} className="animate-spin mr-1" />
                   {transcribingId === item.id ? transcribeProgress : 'Processing...'}
                 </span>
               )}
               <button className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500" title="Archive"><CheckCircle2 size={16} /></button>
               <button className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500" title="Delete"><Mail size={16} /></button>
               <button className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500" title="Mark as unread"><Mail size={16} /></button>
            </div>
          </div>
        );
      })}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center mb-4">
              <Key size={24} className="text-purple-600 mr-3" />
              <h2 className="text-lg font-bold">AssemblyAI API Key Required</h2>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              To transcribe podcasts, you need an AssemblyAI API key.
              Get one free at <a href="https://www.assemblyai.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">assemblyai.com</a>
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter your API key"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
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

// Sub-component for the expanded article body
const ExpandedCard = ({ item, sourceName, onToggleStar }: { item: FeedItem, sourceName: string, onToggleStar: any }) => {
  const [summary, setSummary] = useState<string | null>(item.aiSummary || null);
  const [rawTranscript, setRawTranscript] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  // Robust fallback for video detection
  const isVideo = item.mediaType === 'video' || (item.url && (item.url.includes('youtube.com') || item.url.includes('youtu.be')));

  const getVideoId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  // Step 1: Fetch raw transcript from YouTube
  const handleFetchTranscript = async () => {
    const videoId = getVideoId(item.url);
    if (!videoId) {
      setFetchError('Could not extract video ID from URL');
      return;
    }
    
    setIsFetching(true);
    setFetchError(null);
    try {
      const transcript = await getTranscript(videoId);
      if (transcript) {
        setRawTranscript(transcript);
      } else {
        setFetchError('No captions available for this video');
      }
    } catch (error: any) {
      setFetchError(error.message || 'Failed to fetch transcript');
    } finally {
      setIsFetching(false);
    }
  };

  // Step 2: Polish the transcript with Gemini
  const handlePolishTranscript = async () => {
    if (!rawTranscript) return;
    
    setIsGenerating(true);
    try {
      const result = await polishTranscript(rawTranscript, undefined, item.title);
      setSummary(result);
      await storage.updateSummary(item.id, result);
    } catch (error: any) {
      alert(`Failed to polish transcript: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Transform presets
  const TRANSFORM_PROMPTS: Record<string, string> = {
    summarize: `Summarize this transcript in 5-7 bullet points. Focus on the key insights and actionable takeaways.

Transcript:
`,
    key_points: `Extract the 10 most important points from this transcript. Format as a numbered list with brief explanations.

Transcript:
`,
    quotes: `Extract the most quotable and insightful statements from this transcript. Format each quote with context about who said it and why it matters.

Transcript:
`,
  };

  const handleTransform = async (transformType: string) => {
    if (!rawTranscript) return;
    
    setIsGenerating(true);
    try {
      let prompt: string;
      if (transformType === 'custom') {
        prompt = `${customPrompt}\n\nTranscript:\n${rawTranscript}`;
      } else {
        prompt = TRANSFORM_PROMPTS[transformType] + rawTranscript;
      }
      
      const result = await generateArticleSummary(prompt);
      setSummary(result);
      await storage.updateSummary(item.id, result);
    } catch (error: any) {
      alert(`Transform failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // For non-video content: summarize
  const handleSummarize = async () => {
    setIsGenerating(true);
    try {
      const textToAnalyze = (item.content || "") + "\n" + (item.snippet || "");
      const prompt = `Summarize this article into exactly 3 concise bullet points. Style: Objective, journalistic, and dense.\n\nArticle Title: ${item.title}\n\nArticle Content:\n${textToAnalyze}`;
      const result = await generateArticleSummary(prompt);
      setSummary(result);
      await storage.updateSummary(item.id, result);
    } catch (error) {
      alert("Failed to generate summary.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveMarkdown = () => {
      const markdown = `# ${item.title}\n\n**Source:** ${sourceName}\n**URL:** ${item.url}\n**Date:** ${new Date(item.timestamp).toLocaleString()}\n\n---\n\n${item.content || item.snippet}`;
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const videoId = isVideo ? getVideoId(item.url) : null;
  // Use current origin for iframe permissions
  const origin = window.location.origin;

  return (
    <div className="font-sans text-reader-text">
      
      <div className="flex items-center mb-6 space-x-3">
         <a href={item.url} target="_blank" rel="noreferrer" className="text-reader-active font-medium hover:underline text-sm flex items-center">
            <ExternalLink size={14} className="mr-1" /> Open in new tab
         </a>
         <button onClick={handleSaveMarkdown} className="text-gray-500 hover:text-black font-medium text-sm flex items-center">
            <Download size={14} className="mr-1" /> Save as Markdown
         </button>
      </div>

      {videoId && (
        <div className="mb-8 relative pb-[56.25%] h-0 rounded-2xl overflow-hidden shadow-sm bg-black">
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

      {/* YouTube Transcript Workflow */}
      {isVideo && (
        <div className="mb-6 space-y-4">
          {/* Step 1: Fetch Transcript */}
          {!rawTranscript && !summary && (
            <div className="flex items-center space-x-3">
              <button 
                onClick={handleFetchTranscript}
                disabled={isFetching}
                className="flex items-center space-x-2 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded-full transition-all shadow-sm"
              >
                {isFetching ? <Loader2 size={16} className="animate-spin text-blue-500" /> : <Download size={16} className="text-blue-500" />}
                <span>{isFetching ? 'Fetching...' : '1. Fetch Transcript'}</span>
              </button>
              {fetchError && <span className="text-red-500 text-sm">{fetchError}</span>}
            </div>
          )}

          {/* Step 2: Transform Options (shown after transcript fetched) */}
          {rawTranscript && !summary && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-green-600 flex items-center">
                  <Check size={16} className="mr-1" /> Transcript fetched ({rawTranscript.length.toLocaleString()} chars)
                </span>
              </div>
              
              <p className="text-xs text-gray-500 mb-3">Choose a transform:</p>
              
              <div className="flex flex-wrap gap-2 mb-3">
                <button 
                  onClick={handlePolishTranscript}
                  disabled={isGenerating}
                  className="flex items-center space-x-1 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-full transition-all"
                >
                  {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
                  <span>Polish</span>
                </button>
                <button 
                  onClick={() => handleTransform('summarize')}
                  disabled={isGenerating}
                  className="flex items-center space-x-1 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3 py-1.5 rounded-full transition-all"
                >
                  <Sparkles size={14} />
                  <span>Summarize</span>
                </button>
                <button 
                  onClick={() => handleTransform('key_points')}
                  disabled={isGenerating}
                  className="flex items-center space-x-1 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3 py-1.5 rounded-full transition-all"
                >
                  <FileText size={14} />
                  <span>Key Points</span>
                </button>
                <button 
                  onClick={() => handleTransform('quotes')}
                  disabled={isGenerating}
                  className="flex items-center space-x-1 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3 py-1.5 rounded-full transition-all"
                >
                  <span>"</span>
                  <span>Extract Quotes</span>
                </button>
                <button 
                  onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                  className="flex items-center space-x-1 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3 py-1.5 rounded-full transition-all"
                >
                  <span>💬</span>
                  <span>Custom</span>
                </button>
              </div>

              {showCustomPrompt && (
                <div className="mt-3">
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Enter your custom prompt... e.g. 'Analyze this from a marketing perspective' or 'What are the actionable takeaways?'"
                    className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    rows={3}
                  />
                  <button 
                    onClick={() => handleTransform('custom')}
                    disabled={isGenerating || !customPrompt.trim()}
                    className="mt-2 flex items-center space-x-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 px-4 py-2 rounded-full transition-all"
                  >
                    {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    <span>Run Custom Transform</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Output */}
          {summary && (
            <div className="bg-[#F2F6FC] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center text-reader-active font-bold text-sm">
                  <FileText size={16} className="mr-2" /> 
                  Transformed Output
                </div>
                <button 
                  onClick={() => { setSummary(null); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  ← Back to transforms
                </button>
              </div>
              <div className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-line">
                {summary}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Non-video: Simple summarize button */}
      {!isVideo && (
        <>
          {summary ? (
            <div className="mb-8 relative overflow-hidden rounded-2xl bg-[#F2F6FC] p-5 border-none">
              <div className="flex items-center text-reader-active font-bold text-sm mb-3">
                <Sparkles size={16} className="mr-2" /> AI Summary
              </div>
              <div className="text-gray-800 text-[15px] leading-relaxed font-medium whitespace-pre-line">
                {summary}
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <button 
                onClick={handleSummarize}
                disabled={isGenerating}
                className="flex items-center space-x-2 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded-full transition-all shadow-sm group"
              >
                {isGenerating ? <Loader2 size={16} className="animate-spin text-reader-active" /> : <Sparkles size={16} className="text-reader-active" />}
                <span className="group-hover:text-reader-active transition-colors">
                   {isGenerating ? 'Processing...' : 'Summarize with AI'}
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Content Renderer */}
      <div 
        className="prose prose-lg max-w-none text-[#1F1F1F] text-[16px] leading-relaxed font-sans
        [&>p]:mb-5 [&>p]:leading-7 
        [&>h3]:text-xl [&>h3]:font-medium [&>h3]:mt-6 [&>h3]:mb-3 [&>h3]:text-black
        [&>img]:max-w-full [&>img]:rounded-xl [&>img]:my-6 
        [&>blockquote]:border-l-2 [&>blockquote]:border-reader-active [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-gray-600
        [&>pre]:bg-[#F6F8FC] [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:text-sm
        [&>ul]:list-disc [&>ul]:pl-5 [&>li]:mb-2"
        dangerouslySetInnerHTML={{ __html: item.content || item.snippet }} 
      />
    </div>
  );
}