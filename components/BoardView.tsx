/**
 * Board View
 *
 * Displays the contents of a board - items saved to the collection.
 * Similar to FeedList but for curated board items.
 */

import React, { useState } from "react";
import {
  ArrowLeft,
  Star,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  FileText,
  PenTool,
  Clock,
  Youtube,
  Check,
  Share2,
  Edit2,
  Globe,
  Lock,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import ReactMarkdown from "react-markdown";

interface BoardViewProps {
  boardId: Id<"boards">;
  onBack: () => void;
  onOpenItem?: (documentId: Id<"documents">) => void;
}

export function BoardView({ boardId, onBack, onOpenItem }: BoardViewProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const board = useQuery(api.boards.get, { boardId });
  const updateBoard = useMutation(api.boards.update);
  const removeItem = useMutation(api.boards.removeItem);

  if (!board) {
    return (
      <div className="flex-grow flex items-center justify-center text-ink-muted">
        Loading board...
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleRemoveItem = async (documentId: Id<"documents">) => {
    if (!confirm("Remove this item from the board?")) return;
    try {
      await removeItem({ boardId, documentId });
      setMenuOpen(null);
    } catch (error) {
      console.error("Failed to remove item:", error);
    }
  };

  const togglePublic = async () => {
    try {
      await updateBoard({ boardId, isPublic: !board.isPublic });
    } catch (error) {
      console.error("Failed to update board:", error);
    }
  };

  const copyShareLink = () => {
    if (board.shareSlug) {
      navigator.clipboard.writeText(
        `${window.location.origin}/board/${board.shareSlug}`
      );
    }
  };

  return (
    <div className="flex-grow flex flex-col h-full bg-cream overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-cream-warm rounded-md text-ink-muted hover:text-ink transition-colors"
            title="Back"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>

          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: board.color || "#e5e5e5" }}
            >
              {board.icon || "📋"}
            </div>
            <div>
              <h1 className="font-semibold text-ink">{board.name}</h1>
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <span>{board.items.length} items</span>
                {board.isPublic ? (
                  <span className="flex items-center gap-1 text-status-success">
                    <Globe size={10} />
                    Public
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Lock size={10} />
                    Private
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {board.isPublic && (
            <button
              onClick={copyShareLink}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-ink-muted hover:text-ink hover:bg-cream-warm rounded-md transition-colors"
            >
              <Share2 size={14} />
              Copy Link
            </button>
          )}
          <button
            onClick={togglePublic}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              board.isPublic
                ? "text-status-success bg-status-success/10 hover:bg-status-success/20"
                : "text-ink-muted hover:text-ink hover:bg-cream-warm"
            }`}
          >
            {board.isPublic ? <Globe size={14} /> : <Lock size={14} />}
            {board.isPublic ? "Public" : "Make Public"}
          </button>
        </div>
      </div>

      {/* Board Description */}
      {board.description && (
        <div className="px-4 py-3 bg-cream-warm border-b border-border">
          <p className="text-sm text-ink-soft">{board.description}</p>
        </div>
      )}

      {/* Items List */}
      <div className="flex-grow overflow-y-auto p-4">
        {board.items.length === 0 ? (
          <div className="text-center py-12 text-ink-muted">
            <FileText size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No items in this board yet</p>
            <p className="text-xs mt-1">
              Save articles, podcasts, and videos to this board from your feed
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {board.items.map((item: any) => {
              if (!item.document) return null;

              const doc = item.document;
              const isVideo =
                doc.type === "video" ||
                (doc.article?.url &&
                  (doc.article.url.includes("youtube.com") ||
                    doc.article.url.includes("youtu.be")));
              const isPodcast =
                doc.type === "transcript" || !!doc.article?.audioUrl;
              const isTranscribed =
                doc.article?.transcriptionStatus === "complete";

              return (
                <div
                  key={item._id}
                  className="group relative bg-surface border-2 border-border hover:border-ink rounded-lg p-4 transition-all cursor-pointer"
                  onClick={() => onOpenItem?.(doc._id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Type Icon */}
                    <div className="w-10 h-10 rounded-md bg-cream-warm flex items-center justify-center flex-shrink-0">
                      {isVideo && (
                        <Youtube
                          size={18}
                          className="text-status-error"
                          strokeWidth={1.5}
                        />
                      )}
                      {isPodcast &&
                        (isTranscribed ? (
                          <Check
                            size={18}
                            className="text-status-success"
                            strokeWidth={2}
                          />
                        ) : (
                          <PenTool
                            size={18}
                            className="text-accent"
                            strokeWidth={1.5}
                          />
                        ))}
                      {!isVideo && !isPodcast && (
                        <FileText
                          size={18}
                          className="text-ink-muted"
                          strokeWidth={1.5}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-ink text-sm leading-tight mb-1 line-clamp-2">
                        {doc.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        {doc.article?.siteName && (
                          <span className="truncate">
                            {doc.article.siteName}
                          </span>
                        )}
                        {doc.created && (
                          <>
                            <span>•</span>
                            <span className="flex-shrink-0">
                              {formatDate(doc.created)}
                            </span>
                          </>
                        )}
                        {isPodcast && doc.article?.duration && (
                          <>
                            <span>•</span>
                            <span className="flex items-center flex-shrink-0">
                              <Clock size={10} className="mr-0.5" />
                              {doc.article.duration}
                            </span>
                          </>
                        )}
                      </div>

                      {/* User Note */}
                      {item.note && (
                        <div className="mt-2 p-2 bg-cream-warm rounded text-xs text-ink-soft italic">
                          {item.note}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {doc.article?.url && (
                        <a
                          href={doc.article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 hover:bg-cream-warm rounded text-ink-muted hover:text-ink transition-colors"
                          title="Open original"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(
                            menuOpen === item._id ? null : item._id
                          );
                        }}
                        className="p-1.5 hover:bg-cream-warm rounded text-ink-muted hover:text-ink transition-colors"
                      >
                        <MoreHorizontal size={14} />
                      </button>

                      {/* Dropdown Menu */}
                      {menuOpen === item._id && (
                        <div className="absolute right-2 top-12 z-10 bg-cream border-2 border-ink rounded-lg shadow-brutal py-1 min-w-[120px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveItem(doc._id);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
