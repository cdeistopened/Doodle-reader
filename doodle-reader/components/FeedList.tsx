import React, { useEffect, useRef, useState } from 'react';
import { FeedItem, ViewMode, FeedSource } from '../types';
import { Star, ExternalLink, Sparkles, Loader2, Share2, Mail, CheckCircle2, Download, Youtube, ArrowLeft, ChevronLeft, ChevronRight, Printer, FileText } from 'lucide-react';
import { generateArticleSummary, polishTranscript } from '../lib/ai';
import { getTranscript } from '../lib/youtube';
import { db } from '../lib/db';

interface FeedListProps {
  items: FeedItem[];
  feeds: FeedSource[]; 
  selectedIndex: number;
  expandedId: string | null; 
  onSelectItem: (index: number) => void;
  onOpenItem: (id: string) => void; // Enter reading mode
  onBackToList: () => void; // Exit reading mode
  onToggleStar: (e: React.MouseEvent, id: string) => void;
  onNextItem: () => void;
  onPrevItem: () => void;
  viewMode: ViewMode;
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
  viewMode 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

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
        // Fallback for detecting videos if mediaType wasn't saved in older DB records
        const isVideo = item.mediaType === 'video' || (item.url && (item.url.includes('youtube.com') || item.url.includes('youtu.be')));

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
               <span className={`truncate text-[15px] ${!isRead ? 'text-black font-bold' : 'text-black font-normal'}`}>
                  {item.title || '(No Title)'}
               </span>
            </div>

            {/* Source Column (Secondary, Second) */}
             <div className={`flex-[1.5] min-w-[120px] max-w-[180px] truncate text-[14px] ${!isRead ? 'text-gray-900 font-medium' : 'text-gray-500 font-normal'} mr-4`}>
               {sourceName}
            </div>

            {/* Snippet Column (Tertiary - Hidden on small screens) */}
            <div className="flex-[3] min-w-0 truncate text-gray-400 text-[14px] hidden xl:block mr-4">
               {item.snippet}
            </div>

            {/* Date */}
            <div className={`w-[80px] flex-shrink-0 text-right text-[12px] ml-auto ${!isRead ? 'text-black font-bold' : 'text-gray-500'}`}>
               {formatTime(item.timestamp)}
            </div>
            
            {/* Hover Actions (Gmail style) */}
            <div className="absolute right-4 bg-white shadow-sm border border-gray-200 rounded-r-full px-2 py-1 hidden group-hover:flex items-center space-x-1">
               <button className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500" title="Archive"><CheckCircle2 size={16} /></button>
               <button className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500" title="Delete"><Mail size={16} /></button>
               <button className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500" title="Mark as unread"><Mail size={16} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Sub-component for the expanded article body
const ExpandedCard = ({ item, sourceName, onToggleStar }: { item: FeedItem, sourceName: string, onToggleStar: any }) => {
  const [summary, setSummary] = useState<string | null>(item.aiSummary || null);
  const [isGenerating, setIsGenerating] = useState(false);
  // Robust fallback for video detection
  const isVideo = item.mediaType === 'video' || (item.url && (item.url.includes('youtube.com') || item.url.includes('youtu.be')));

  const getVideoId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  const handleSummarize = async () => {
    setIsGenerating(true);
    try {
      let result;
      // Pass content + snippet to ensure AI has enough context
      const textToAnalyze = (item.content || "") + "\n" + (item.snippet || "");
      
      if (isVideo) {
        // Attempt to scrape real transcript first
        const videoId = getVideoId(item.url);
        let rawTranscript = null;
        if (videoId) {
           rawTranscript = await getTranscript(videoId);
        }
        
        if (rawTranscript) {
          result = await polishTranscript(item.title, rawTranscript);
        } else {
          // Fallback to description
          result = await polishTranscript(item.title, textToAnalyze);
        }
      } else {
        result = await generateArticleSummary(item.title, textToAnalyze);
      }
      setSummary(result);
      await db.updateItemSummary(item.id, result);
    } catch (error) {
      alert("Failed to generate content.");
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

      {/* AI Summary/Transcript Section */}
      {summary ? (
        <div className="mb-8 relative overflow-hidden rounded-2xl bg-[#F2F6FC] p-5 border-none">
          <div className="flex items-center text-reader-active font-bold text-sm mb-3">
            {isVideo ? <FileText size={16} className="mr-2" /> : <Sparkles size={16} className="mr-2" />} 
            {isVideo ? 'Smart Transcript & Analysis' : 'AI Summary'}
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
            {isGenerating ? <Loader2 size={16} className="animate-spin text-reader-active" /> : 
             (isVideo ? <FileText size={16} className="text-reader-active" /> : <Sparkles size={16} className="text-reader-active" />)
            }
            <span className="group-hover:text-reader-active transition-colors">
               {isGenerating ? 'Processing...' : (isVideo ? '✨ Generate Smart Transcript' : 'Summarize with AI')}
            </span>
          </button>
        </div>
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