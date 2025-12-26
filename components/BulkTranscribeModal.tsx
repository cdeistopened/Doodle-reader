import React, { useState, useMemo } from 'react';
import { X, Mic, Clock, DollarSign, CheckSquare, Square, AlertCircle, Sparkles, Mail } from 'lucide-react';
import type { FeedItem } from '../types';

interface BulkTranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: FeedItem[];
  feedTitle?: string;
}

// Parse duration string to seconds
// Handles: "2652" (seconds), "44:12" (MM:SS), "1:23:45" (HH:MM:SS)
function parseDuration(duration: string | undefined): number {
  if (!duration) return 0;

  // If it's just a number (seconds), parse directly
  if (/^\d+$/.test(duration)) {
    return parseInt(duration, 10);
  }

  // Otherwise parse as HH:MM:SS or MM:SS
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// Format seconds to human-readable HH:MM format
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Format seconds to MM:SS or HH:MM:SS for display in list
function formatDurationShort(duration: string | undefined): string {
  if (!duration) return '';
  const seconds = parseDuration(duration);
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Pricing per hour
// AssemblyAI: $0.37/hour for transcription with speaker diarization
const ASSEMBLYAI_COST_PER_HOUR = 0.37;
// Gemini polishing: ~$0.01/hour (processing the transcript text)
const GEMINI_POLISH_COST_PER_HOUR = 0.01;

export const BulkTranscribeModal: React.FC<BulkTranscribeModalProps> = ({
  isOpen,
  onClose,
  items,
  feedTitle,
}) => {
  // Filter to only podcast episodes that haven't been transcribed
  const eligibleItems = useMemo(() =>
    items.filter(item =>
      item.mediaType === 'audio' &&
      item.audioUrl &&
      item.transcriptionStatus !== 'complete'
    ),
    [items]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(eligibleItems.map(i => i.id))
  );
  const [notes, setNotes] = useState('');

  // Reset selection when items change
  React.useEffect(() => {
    setSelectedIds(new Set(eligibleItems.map(i => i.id)));
  }, [eligibleItems]);

  const selectedItems = useMemo(() =>
    eligibleItems.filter(item => selectedIds.has(item.id)),
    [eligibleItems, selectedIds]
  );

  const totalDurationSeconds = useMemo(() =>
    selectedItems.reduce((acc, item) => acc + parseDuration(item.duration), 0),
    [selectedItems]
  );

  const totalHours = totalDurationSeconds / 3600;
  const assemblyAICost = totalHours * ASSEMBLYAI_COST_PER_HOUR;
  const geminiPolishCost = totalHours * GEMINI_POLISH_COST_PER_HOUR;
  const totalEstimatedCost = assemblyAICost + geminiPolishCost;

  const toggleAll = () => {
    if (selectedIds.size === eligibleItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleItems.map(i => i.id)));
    }
  };

  const toggleItem = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleRequestQuote = () => {
    const subject = encodeURIComponent(`Bulk Transcription Request: ${feedTitle || 'Podcast Feed'}`);
    const body = encodeURIComponent(`Hi Charlie,

I'd like to request bulk transcription for the following:

FEED: ${feedTitle || 'Podcast Feed'}
EPISODES: ${selectedItems.length} episodes selected
TOTAL DURATION: ${formatDuration(totalDurationSeconds)} (${totalHours.toFixed(1)} hours)

COST BREAKDOWN:
- AssemblyAI (transcription + speaker labels): $${assemblyAICost.toFixed(2)}
- Gemini (polishing & speaker confirmation): $${geminiPolishCost.toFixed(2)}
- TOTAL ESTIMATE: $${totalEstimatedCost.toFixed(2)}

${notes ? `ADDITIONAL NOTES:\n${notes}\n` : ''}
---
Episode list:
${selectedItems.slice(0, 20).map((item, i) => `${i + 1}. ${item.title}`).join('\n')}${selectedItems.length > 20 ? `\n... and ${selectedItems.length - 20} more episodes` : ''}

Thanks!`);

    window.open(`mailto:chdeist@gmail.com?subject=${subject}&body=${body}`, '_blank');
  };

  if (!isOpen) return null;

  const alreadyTranscribed = items.filter(i => i.transcriptionStatus === 'complete').length;

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-surface border-2 border-ink rounded-lg shadow-brutal w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mic size={20} className="text-accent" strokeWidth={1.5} />
            <h2 className="font-serif text-lg font-semibold text-ink">Bulk Transcription</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-cream-warm rounded text-ink-muted hover:text-ink transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stats Summary */}
        <div className="px-5 py-4 bg-cream-warm border-b border-border">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-ink">{selectedItems.length}</div>
              <div className="text-xs text-ink-muted">Episodes Selected</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-ink flex items-center justify-center gap-1">
                <Clock size={18} className="text-ink-muted" />
                {formatDuration(totalDurationSeconds)}
              </div>
              <div className="text-xs text-ink-muted">Total Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent flex items-center justify-center gap-1">
                <DollarSign size={18} />
                {totalEstimatedCost.toFixed(2)}
              </div>
              <div className="text-xs text-ink-muted">Total Estimate</div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-xs font-medium text-ink mb-2">Cost Breakdown:</div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <Mic size={12} className="text-accent" />
                  AssemblyAI (transcription + speaker labels)
                </span>
                <span className="font-medium text-ink">${assemblyAICost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <Sparkles size={12} className="text-blue-500" />
                  Gemini (polishing & speaker confirmation)
                </span>
                <span className="font-medium text-ink">${geminiPolishCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {alreadyTranscribed > 0 && (
            <div className="mt-3 text-xs text-ink-muted text-center">
              {alreadyTranscribed} episode{alreadyTranscribed !== 1 ? 's' : ''} already transcribed
            </div>
          )}
        </div>

        {/* Episode List */}
        <div className="flex-1 overflow-y-auto">
          {/* Select All Header */}
          <div
            className="px-5 py-3 border-b border-border bg-surface sticky top-0 flex items-center gap-3 cursor-pointer hover:bg-cream-warm"
            onClick={toggleAll}
          >
            {selectedIds.size === eligibleItems.length ? (
              <CheckSquare size={18} className="text-accent" />
            ) : (
              <Square size={18} className="text-ink-muted" />
            )}
            <span className="text-sm font-medium text-ink">
              {selectedIds.size === eligibleItems.length ? 'Deselect All' : 'Select All'}
            </span>
            <span className="text-xs text-ink-muted ml-auto">
              {eligibleItems.length} eligible episodes
            </span>
          </div>

          {/* Episodes */}
          {eligibleItems.length === 0 ? (
            <div className="p-8 text-center text-ink-muted">
              <AlertCircle size={32} className="mx-auto mb-3 opacity-50" />
              <p>No episodes available for transcription.</p>
              <p className="text-xs mt-1">All episodes may already be transcribed.</p>
            </div>
          ) : (
            eligibleItems.map(item => (
              <div
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className="px-5 py-3 border-b border-border-muted flex items-center gap-3 cursor-pointer transition-colors hover:bg-cream-warm"
              >
                {selectedIds.has(item.id) ? (
                  <CheckSquare size={18} className="text-accent flex-shrink-0" />
                ) : (
                  <Square size={18} className="text-ink-muted flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink truncate">{item.title}</div>
                  <div className="text-xs text-ink-muted flex items-center gap-2">
                    {item.duration && (
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDurationShort(item.duration)}
                      </span>
                    )}
                    <span>
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Notes & Request Section */}
        <div className="px-5 py-4 bg-cream-warm border-t border-border">
          <div className="mb-3">
            <label className="block text-xs font-medium text-ink mb-1.5">
              Additional Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements, timeline, or questions..."
              className="w-full px-3 py-2 text-sm bg-surface border-2 border-border rounded-md focus:border-accent focus:outline-none resize-none"
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-ink-muted">
              Pricing: $0.37/hr (AssemblyAI) + $0.01/hr (Gemini)
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-ink font-medium text-sm rounded-md border-2 border-border hover:border-ink transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestQuote}
                disabled={selectedItems.length === 0}
                className="px-5 py-2 bg-accent text-white font-medium text-sm rounded-md border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Mail size={16} />
                Start My Job
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
