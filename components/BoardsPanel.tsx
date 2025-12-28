/**
 * Boards Panel
 *
 * Shows in the sidebar - lists all boards with item counts.
 * Allows creating new boards and navigating to board views.
 */

import React, { useState } from "react";
import { Folder, Plus, MoreHorizontal, Trash2, Share2, Edit2, X, Check } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

interface BoardsPanelProps {
  activeBoard: Id<"boards"> | null;
  onSelectBoard: (boardId: Id<"boards">) => void;
}

export function BoardsPanel({ activeBoard, onSelectBoard }: BoardsPanelProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [editingId, setEditingId] = useState<Id<"boards"> | null>(null);
  const [editingName, setEditingName] = useState("");
  const [menuOpen, setMenuOpen] = useState<Id<"boards"> | null>(null);

  const boards = useQuery(api.boards.list);
  const createBoard = useMutation(api.boards.create);
  const updateBoard = useMutation(api.boards.update);
  const deleteBoard = useMutation(api.boards.remove);

  const handleCreate = async () => {
    if (!newBoardName.trim()) return;
    try {
      await createBoard({ name: newBoardName.trim() });
      setNewBoardName("");
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create board:", error);
    }
  };

  const handleRename = async (boardId: Id<"boards">) => {
    if (!editingName.trim()) return;
    try {
      await updateBoard({ boardId, name: editingName.trim() });
      setEditingId(null);
      setEditingName("");
    } catch (error) {
      console.error("Failed to rename board:", error);
    }
  };

  const handleDelete = async (boardId: Id<"boards">) => {
    if (!confirm("Delete this board? Items will not be deleted.")) return;
    try {
      await deleteBoard({ boardId });
      setMenuOpen(null);
      if (activeBoard === boardId) {
        onSelectBoard(null as any); // Deselect
      }
    } catch (error) {
      console.error("Failed to delete board:", error);
    }
  };

  const startEditing = (board: { _id: Id<"boards">; name: string }) => {
    setEditingId(board._id);
    setEditingName(board.name);
    setMenuOpen(null);
  };

  return (
    <div className="py-2">
      {/* Header */}
      <div className="px-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Boards
        </span>
        <button
          onClick={() => setIsCreating(true)}
          className="p-1 hover:bg-cream-dark rounded transition-colors text-ink-muted hover:text-ink"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Create New */}
      {isCreating && (
        <div className="px-3 pb-2">
          <div className="flex gap-1">
            <input
              type="text"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="Board name..."
              className="flex-1 px-2 py-1.5 text-sm bg-surface border border-border rounded focus:outline-none focus:border-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setIsCreating(false);
                  setNewBoardName("");
                }
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!newBoardName.trim()}
              className="p-1.5 bg-accent text-white rounded disabled:opacity-50"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewBoardName("");
              }}
              className="p-1.5 text-ink-muted hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Board List */}
      <div className="space-y-0.5">
        {boards?.map((board) => (
          <div
            key={board._id}
            className={`group relative flex items-center px-3 py-2 cursor-pointer transition-all ${
              activeBoard === board._id
                ? "bg-accent/10 text-accent"
                : "hover:bg-cream-dark text-ink-soft hover:text-ink"
            }`}
          >
            {editingId === board._id ? (
              <div className="flex-1 flex gap-1">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="flex-1 px-2 py-1 text-sm bg-surface border border-border rounded focus:outline-none focus:border-accent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(board._id);
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditingName("");
                    }
                  }}
                />
                <button
                  onClick={() => handleRename(board._id)}
                  className="p-1 bg-accent text-white rounded"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <>
                <div
                  className="flex-1 flex items-center gap-2 min-w-0"
                  onClick={() => onSelectBoard(board._id)}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-xs shrink-0"
                    style={{ backgroundColor: board.color || "#e5e5e5" }}
                  >
                    {board.icon || "📋"}
                  </div>
                  <span className="text-sm truncate">{board.name}</span>
                  <span className="text-xs text-ink-muted ml-auto">
                    {board.itemCount}
                  </span>
                </div>

                {/* Menu Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === board._id ? null : board._id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-cream rounded transition-all"
                >
                  <MoreHorizontal size={14} />
                </button>

                {/* Dropdown Menu */}
                {menuOpen === board._id && (
                  <div className="absolute right-2 top-full mt-1 z-10 bg-cream border-2 border-ink rounded-lg shadow-brutal py-1 min-w-[140px]">
                    <button
                      onClick={() => startEditing(board)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-cream-dark flex items-center gap-2"
                    >
                      <Edit2 size={14} />
                      Rename
                    </button>
                    {board.isPublic ? (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/board/${board.shareSlug}`
                          );
                          setMenuOpen(null);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-cream-dark flex items-center gap-2"
                      >
                        <Share2 size={14} />
                        Copy Link
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          await updateBoard({ boardId: board._id, isPublic: true });
                          setMenuOpen(null);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-cream-dark flex items-center gap-2"
                      >
                        <Share2 size={14} />
                        Make Public
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(board._id)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {boards?.length === 0 && !isCreating && (
          <div className="px-3 py-4 text-center text-sm text-ink-muted">
            <Folder size={20} className="mx-auto mb-2 opacity-50" />
            <p>No boards yet</p>
            <button
              onClick={() => setIsCreating(true)}
              className="mt-2 text-accent hover:underline text-xs"
            >
              Create your first board
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
