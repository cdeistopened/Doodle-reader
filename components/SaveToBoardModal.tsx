/**
 * Save to Board Modal
 *
 * Allows users to save an item to one or more boards.
 * Similar to Feedly's "Save to Board" or Pinterest's board picker.
 */

import React, { useState } from "react";
import { X, Plus, Check, Folder, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

interface SaveToBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: Id<"documents">;
  documentTitle?: string;
}

export function SaveToBoardModal({
  isOpen,
  onClose,
  documentId,
  documentTitle = "this item",
}: SaveToBoardModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [savingTo, setSavingTo] = useState<string | null>(null);

  // Queries
  const boards = useQuery(api.boards.list);
  const documentBoards = useQuery(api.boards.getBoardsForDocument, {
    documentId,
  });

  // Mutations
  const createBoard = useMutation(api.boards.create);
  const addToBoard = useMutation(api.boards.addItem);
  const removeFromBoard = useMutation(api.boards.removeItem);

  if (!isOpen) return null;

  const isInBoard = (boardId: Id<"boards">) => {
    return documentBoards?.some((b) => b._id === boardId);
  };

  const handleToggleBoard = async (boardId: Id<"boards">) => {
    setSavingTo(boardId);
    try {
      if (isInBoard(boardId)) {
        await removeFromBoard({ boardId, documentId });
      } else {
        await addToBoard({ boardId, documentId });
      }
    } catch (error) {
      console.error("Failed to update board:", error);
    } finally {
      setSavingTo(null);
    }
  };

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;

    try {
      const boardId = await createBoard({ name: newBoardName.trim() });
      // Automatically add item to new board
      await addToBoard({ boardId, documentId });
      setNewBoardName("");
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create board:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-cream rounded-xl shadow-brutal max-w-md w-full max-h-[80vh] flex flex-col border-2 border-ink">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-serif font-bold text-lg text-ink">
              Save to Board
            </h2>
            <p className="text-sm text-ink-muted truncate max-w-[280px]">
              {documentTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-cream-dark rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Board List */}
        <div className="flex-1 overflow-y-auto p-2">
          {boards === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-ink-muted" />
            </div>
          ) : boards.length === 0 && !isCreating ? (
            <div className="text-center py-8">
              <Folder size={32} className="mx-auto mb-3 text-ink-muted" />
              <p className="text-ink-muted mb-4">No boards yet</p>
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent-muted transition-colors"
              >
                Create your first board
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {boards?.map((board) => {
                const inBoard = isInBoard(board._id);
                const isSaving = savingTo === board._id;

                return (
                  <button
                    key={board._id}
                    onClick={() => handleToggleBoard(board._id)}
                    disabled={isSaving}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                      inBoard
                        ? "bg-accent/10 border-2 border-accent"
                        : "bg-surface hover:bg-cream-dark border-2 border-transparent"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
                        board.color
                          ? ""
                          : "bg-stone-200"
                      }`}
                      style={board.color ? { backgroundColor: board.color } : {}}
                    >
                      {board.icon || "📋"}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-ink">{board.name}</div>
                      <div className="text-xs text-ink-muted">
                        {board.itemCount} {board.itemCount === 1 ? "item" : "items"}
                      </div>
                    </div>
                    <div className="w-6 h-6 flex items-center justify-center">
                      {isSaving ? (
                        <Loader2 size={16} className="animate-spin text-accent" />
                      ) : inBoard ? (
                        <Check size={18} className="text-accent" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Create New Board */}
        <div className="p-3 border-t border-border">
          {isCreating ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="Board name..."
                className="flex-1 px-3 py-2 bg-surface border-2 border-border rounded-lg focus:outline-none focus:border-accent text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateBoard();
                  if (e.key === "Escape") {
                    setIsCreating(false);
                    setNewBoardName("");
                  }
                }}
              />
              <button
                onClick={handleCreateBoard}
                disabled={!newBoardName.trim()}
                className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent-muted transition-colors disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewBoardName("");
                }}
                className="px-3 py-2 text-ink-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-ink-muted hover:text-ink hover:bg-cream-dark rounded-lg transition-colors"
            >
              <Plus size={16} />
              <span className="text-sm font-medium">New Board</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
