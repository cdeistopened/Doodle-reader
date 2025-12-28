/**
 * Photo Scan Modal
 *
 * Allows users to capture photos from their device camera (mobile)
 * or select image files (desktop) and process them with OCR.
 * Replaces the standalone Page Snap utility with integrated functionality.
 */

import React, { useState, useRef, useCallback } from "react";
import {
  X,
  Camera,
  ImagePlus,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { processImages, ImageOCRProgress } from "../lib/ocr";

interface PhotoScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (
    title: string,
    content: string,
    metadata: {
      pageCount: number;
      fileSizeMB: number;
      processingTimeMs: number;
    }
  ) => Promise<void>;
}

interface CapturedImage {
  id: string;
  file: File;
  preview: string;
}

export function PhotoScanModal({
  isOpen,
  onClose,
  onScanComplete,
}: PhotoScanModalProps) {
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [title, setTitle] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ImageOCRProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const newImages: CapturedImage[] = [];

      Array.from(files).forEach((file) => {
        // Only accept images
        if (!file.type.startsWith("image/")) return;

        const id = crypto.randomUUID();
        const preview = URL.createObjectURL(file);
        newImages.push({ id, file, preview });
      });

      setCapturedImages((prev) => [...prev, ...newImages]);

      // Auto-generate title from first file if not set
      if (!title && newImages.length > 0) {
        const fileName = newImages[0].file.name;
        const baseName = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
        setTitle(baseName.replace(/[_-]/g, " "));
      }

      // Reset input
      event.target.value = "";
    },
    [title]
  );

  const handleRemoveImage = useCallback((id: string) => {
    setCapturedImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const handleClearAll = useCallback(() => {
    capturedImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setCapturedImages([]);
    setTitle("");
    setError(null);
  }, [capturedImages]);

  const handleProcess = async () => {
    if (capturedImages.length === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const files = capturedImages.map((img) => img.file);

      const result = await processImages(files, (p) => {
        setProgress(p);
      });

      // Calculate total file size
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const fileSizeMB = totalSize / (1024 * 1024);

      await onScanComplete(
        title || `Photo Scan ${new Date().toLocaleDateString()}`,
        result.content,
        {
          pageCount: result.imageCount,
          fileSizeMB,
          processingTimeMs: result.processingTimeMs,
        }
      );

      // Cleanup and close
      handleClearAll();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to process images");
      setProgress(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = useCallback(() => {
    if (isProcessing) return; // Prevent closing during processing
    handleClearAll();
    onClose();
  }, [isProcessing, handleClearAll, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-cream rounded-xl shadow-brutal max-w-lg w-full max-h-[90vh] flex flex-col border-2 border-ink overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-cream-warm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <Camera size={20} className="text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="font-serif font-bold text-lg text-ink">
                Photo Scan
              </h2>
              <p className="text-xs text-ink-muted">
                Capture photos and extract text with OCR
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-2 hover:bg-cream-dark rounded-lg transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Title Input */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-ink-muted uppercase tracking-wide mb-1.5">
              Document Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title..."
              className="w-full px-3 py-2.5 bg-surface border-2 border-border rounded-lg focus:outline-none focus:border-accent text-sm"
              disabled={isProcessing}
            />
          </div>

          {/* Capture Buttons */}
          {!isProcessing && (
            <div className="flex gap-2 mb-4">
              {/* Camera Capture - works on mobile */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-muted transition-colors border-2 border-ink shadow-brutal-sm"
              >
                <Camera size={18} strokeWidth={1.5} />
                <span>Take Photo</span>
              </button>

              {/* File Picker */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-surface text-ink rounded-lg font-medium hover:bg-cream-dark transition-colors border-2 border-border"
              >
                <ImagePlus size={18} strokeWidth={1.5} />
                <span>Choose Files</span>
              </button>

              {/* Hidden inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* Image Previews */}
          {capturedImages.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                  Captured Images ({capturedImages.length})
                </span>
                {!isProcessing && capturedImages.length > 1 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs text-status-error hover:underline flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    Clear All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {capturedImages.map((img, index) => (
                  <div
                    key={img.id}
                    className="relative aspect-[4/3] rounded-lg overflow-hidden border-2 border-border group"
                  >
                    <img
                      src={img.preview}
                      alt={`Capture ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {!isProcessing && (
                      <button
                        onClick={() => handleRemoveImage(img.id)}
                        className="absolute top-1 right-1 p-1 bg-ink/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    )}
                    <div className="absolute bottom-1 left-1 bg-ink/80 text-white text-xs px-1.5 py-0.5 rounded">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {capturedImages.length === 0 && !isProcessing && (
            <div className="text-center py-8 text-ink-muted">
              <Camera size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No photos captured yet</p>
              <p className="text-xs mt-1">
                Take a photo or select images to extract text
              </p>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && progress && (
            <div className="bg-accent-soft border-2 border-accent rounded-lg p-4 mt-4">
              <div className="flex items-center gap-3">
                <Loader2 size={20} className="animate-spin text-accent" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">
                    {progress.message}
                  </p>
                  {progress.totalImages && progress.totalImages > 1 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-ink-muted mb-1">
                        <span>
                          Image {progress.currentImage} of {progress.totalImages}
                        </span>
                        <span>
                          {Math.round(
                            ((progress.currentImage || 0) / progress.totalImages) *
                              100
                          )}
                          %
                        </span>
                      </div>
                      <div className="h-2 bg-cream rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{
                            width: `${
                              ((progress.currentImage || 0) / progress.totalImages) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-status-error/10 border-2 border-status-error/20 rounded-lg p-4 mt-4">
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={20}
                  className="text-status-error flex-shrink-0 mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-status-error">
                    Processing Failed
                  </p>
                  <p className="text-xs text-ink-muted mt-1">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="text-xs text-accent hover:underline mt-2 flex items-center gap-1"
                  >
                    <RotateCcw size={12} />
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-cream-warm">
          <button
            onClick={handleProcess}
            disabled={capturedImages.length === 0 || isProcessing}
            className="w-full flex items-center justify-center gap-2 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-muted transition-colors border-2 border-ink shadow-brutal-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Check size={18} strokeWidth={2} />
                <span>
                  Extract Text
                  {capturedImages.length > 0 &&
                    ` (${capturedImages.length} image${
                      capturedImages.length > 1 ? "s" : ""
                    })`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
