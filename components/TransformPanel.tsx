/**
 * TransformPanel Component
 *
 * Unified UI for running AI transforms on content.
 * Replaces the scattered transform buttons in ExpandedCard.
 *
 * Usage:
 * ```tsx
 * <TransformPanel
 *   content={rawTranscript}
 *   contentType="transcript"
 *   title={item.title}
 *   contextPrompt={feed.contextPrompt}
 *   onResult={(result) => storage.updateSummary(item.id, result.output)}
 * />
 * ```
 */

import React, { useState } from 'react';
import { Loader2, PenTool, Sparkles, FileText, Search, ChevronDown, ChevronRight, X, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  useTransform,
  getBuiltinsForType,
  type Transform,
  type TransformResult,
} from '../lib/transforms';

interface TransformPanelProps {
  /** The content to transform */
  content: string;

  /** What type of content is this? */
  contentType: 'transcript' | 'article' | 'document';

  /** Title for context */
  title?: string;

  /** Per-feed context prompt (speaker names, etc.) */
  contextPrompt?: string;

  /** Called when a transform completes successfully */
  onResult?: (result: TransformResult, transform: Transform) => void;

  /** Current stored result (if any) to show */
  currentResult?: string | null;

  /** Called to clear the current result */
  onClearResult?: () => void;

  /** Compact mode - just show buttons */
  compact?: boolean;
}

const ICON_MAP: Record<string, React.FC<{ size?: number; strokeWidth?: number; className?: string }>> = {
  PenTool: PenTool,
  Sparkles: Sparkles,
  FileText: FileText,
  Search: Search,
};

export const TransformPanel: React.FC<TransformPanelProps> = ({
  content,
  contentType,
  title,
  contextPrompt,
  onResult,
  currentResult,
  onClearResult,
  compact = false,
}) => {
  const { execute, isExecuting, progress } = useTransform();
  const [showCustom, setShowCustom] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [activeTransformId, setActiveTransformId] = useState<string | null>(null);

  // Get transforms available for this content type
  const transforms = getBuiltinsForType(contentType);

  const handleRunTransform = async (transform: Transform) => {
    setActiveTransformId(transform.id);
    const result = await execute(transform, {
      content,
      title,
      contextPrompt,
    });

    if (!result.error && onResult) {
      onResult(result, transform);
    }
    setActiveTransformId(null);
  };

  const handleRunCustom = async () => {
    if (!customPrompt.trim()) return;

    const customTransform: Transform = {
      id: 'custom:' + Date.now(),
      name: 'Custom',
      prompt: `${customPrompt}\n\n{{#if title}}Title: {{title}}{{/if}}\n\nContent:\n{{content}}`,
      inputTypes: ['any'],
      outputField: 'custom',
      isBuiltIn: false,
      settings: { temperature: 0.4 },
    };

    setActiveTransformId(customTransform.id);
    const result = await execute(customTransform, {
      content,
      title,
      contextPrompt,
    });

    if (!result.error && onResult) {
      onResult(result, customTransform);
    }
    setActiveTransformId(null);
    setShowCustom(false);
    setCustomPrompt('');
  };

  // Show transform options (always visible)
  return (
    <div className="space-y-4">
      {/* Transformed Output - rendered as markdown */}
      {currentResult && (
        <div className="bg-surface border-2 border-accent rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-accent font-semibold text-sm font-sans">
              <Sparkles size={16} strokeWidth={1.5} />
              Polished Output
            </div>
            {onClearResult && (
              <button
                onClick={onClearResult}
                className="text-xs text-ink-muted hover:text-ink font-sans flex items-center gap-1"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>
          <div className="prose-content">
            <ReactMarkdown>{currentResult}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Full source content panel - only when not compact */}
      {!compact && (
        <div className="bg-cream-warm border-2 border-ink rounded-lg p-4">
          {/* Header with content info */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-status-success flex items-center gap-1 font-sans">
              <Check size={14} strokeWidth={2} />
              {content.length.toLocaleString()} characters ready
            </span>
            {isExecuting && progress && (
              <span className="text-sm text-accent flex items-center gap-2 font-sans">
                <Loader2 size={14} className="animate-spin" />
                {progress.message}
              </span>
            )}
          </div>

          {/* Transcript toggle */}
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="flex items-center gap-1.5 text-sm font-medium text-ink hover:text-accent mb-3 font-sans transition-colors"
          >
            {showTranscript ? (
              <ChevronDown size={14} strokeWidth={2} />
            ) : (
              <ChevronRight size={14} strokeWidth={2} />
            )}
            <FileText size={14} strokeWidth={1.5} />
            <span>Raw Transcript</span>
          </button>

          {/* Raw transcript content */}
          {showTranscript && (
            <div className="mb-4 p-3 bg-surface border border-border rounded-md max-h-64 overflow-y-auto">
              <pre className="text-sm text-ink-muted whitespace-pre-wrap font-mono leading-relaxed">
                {content}
              </pre>
            </div>
          )}

          {/* Transform label */}
          <p className="text-xs text-ink-muted uppercase tracking-wide font-semibold mb-3 font-sans">
            Transform
          </p>

          {/* Transform buttons */}
          <div className="flex flex-wrap gap-2 mb-3">
            {transforms.map((transform) => {
              const Icon = transform.icon ? ICON_MAP[transform.icon] || Sparkles : Sparkles;
              const isActive = activeTransformId === transform.id;
              const isPrimary = transform.category === 'polish';

              return (
                <button
                  key={transform.id}
                  onClick={() => handleRunTransform(transform)}
                  disabled={isExecuting}
                  title={transform.description}
                  className={`
                    flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-all font-sans
                    ${isPrimary
                      ? 'text-white bg-accent hover:bg-accent-muted border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                      : 'text-ink bg-surface hover:bg-cream border-2 border-border hover:border-ink'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none
                  `}
                >
                  {isActive ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Icon size={14} strokeWidth={1.5} />
                  )}
                  <span>{transform.name}</span>
                </button>
              );
            })}

            {/* Custom prompt toggle */}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-1.5 text-sm font-medium text-ink bg-surface hover:bg-cream border-2 border-border hover:border-ink px-3 py-1.5 rounded-md transition-all font-sans"
            >
              <span>Custom</span>
              <ChevronDown size={14} className={`transition-transform ${showCustom ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Custom prompt input */}
          {showCustom && (
            <div className="mt-3 pt-3 border-t border-border">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter your custom prompt... (e.g., 'Extract action items from this transcript')"
                className="w-full p-3 text-sm border-2 border-border rounded-md focus:outline-none focus:border-accent resize-none font-sans bg-surface"
                rows={3}
              />
              <button
                onClick={handleRunCustom}
                disabled={isExecuting || !customPrompt.trim()}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-muted disabled:bg-border disabled:text-ink-muted px-4 py-2 rounded-md transition-all font-sans"
              >
                {activeTransformId?.startsWith('custom:') ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} strokeWidth={1.5} />
                )}
                <span>Run Transform</span>
              </button>
            </div>
          )}

          <p className="text-xs text-ink-muted mt-3 font-sans">
            {contentType === 'transcript'
              ? 'Polish cleans up raw transcripts into readable prose. Other transforms extract specific insights.'
              : 'Choose a transform to analyze this content with AI.'}
          </p>
        </div>
      )}

      {/* Compact mode - just transform buttons, no transcript toggle */}
      {compact && (
        <div>
          {/* Progress indicator */}
          {isExecuting && progress && (
            <div className="mb-3 flex items-center gap-2 text-sm text-accent font-sans">
              <Loader2 size={14} className="animate-spin" />
              {progress.message}
            </div>
          )}

          {/* Transform buttons */}
          <div className="flex flex-wrap gap-2">
            {transforms.map((transform) => {
              const Icon = transform.icon ? ICON_MAP[transform.icon] || Sparkles : Sparkles;
              const isActive = activeTransformId === transform.id;
              const isPrimary = transform.category === 'polish';

              return (
                <button
                  key={transform.id}
                  onClick={() => handleRunTransform(transform)}
                  disabled={isExecuting}
                  title={transform.description}
                  className={`
                    flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-all font-sans
                    ${isPrimary
                      ? 'text-white bg-accent hover:bg-accent-muted border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                      : 'text-ink bg-surface hover:bg-cream border-2 border-border hover:border-ink'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none
                  `}
                >
                  {isActive ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Icon size={14} strokeWidth={1.5} />
                  )}
                  <span>{transform.name}</span>
                </button>
              );
            })}

            {/* Custom prompt toggle */}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-1.5 text-sm font-medium text-ink bg-surface hover:bg-cream border-2 border-border hover:border-ink px-3 py-1.5 rounded-md transition-all font-sans"
            >
              <span>Custom</span>
              <ChevronDown size={14} className={`transition-transform ${showCustom ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Custom prompt input */}
          {showCustom && (
            <div className="mt-3 pt-3 border-t border-border">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter your custom prompt..."
                className="w-full p-3 text-sm border-2 border-border rounded-md focus:outline-none focus:border-accent resize-none font-sans bg-surface"
                rows={2}
              />
              <button
                onClick={handleRunCustom}
                disabled={isExecuting || !customPrompt.trim()}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-muted disabled:bg-border disabled:text-ink-muted px-4 py-2 rounded-md transition-all font-sans"
              >
                {activeTransformId?.startsWith('custom:') ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} strokeWidth={1.5} />
                )}
                <span>Run</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
