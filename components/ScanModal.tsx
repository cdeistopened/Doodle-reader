import React, { useState, useRef } from 'react';
import { Loader2, FileText, Upload, X, CheckCircle2 } from 'lucide-react';
import { processPDF, titleFromFilename, type OCRProgress } from '../lib/ocr';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (title: string, content: string, metadata: {
    pageCount: number;
    fileSizeMB: number;
    processingTimeMs: number;
  }) => Promise<void>;
}

export const ScanModal: React.FC<ScanModalProps> = ({ isOpen, onClose, onScanComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OCRProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please select a PDF file');
        return;
      }
      setFile(selectedFile);
      setTitle(titleFromFilename(selectedFile.name));
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (droppedFile.type !== 'application/pdf') {
        setError('Please select a PDF file');
        return;
      }
      setFile(droppedFile);
      setTitle(titleFromFilename(droppedFile.name));
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setProgress(null);

    try {
      const result = await processPDF(file, setProgress);

      await onScanComplete(title || titleFromFilename(file.name), result.content, {
        pageCount: result.pageCount,
        fileSizeMB: result.fileSizeMB,
        processingTimeMs: result.processingTimeMs,
      });

      // Reset state
      setFile(null);
      setTitle('');
      setProgress(null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to process PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFile(null);
      setTitle('');
      setError(null);
      setProgress(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity p-4">
      <div className="bg-[#F7F9FC] w-full max-w-[560px] rounded-[28px] shadow-xl overflow-hidden font-sans transform transition-all">

        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl text-[#1F1F1F] font-normal font-sans">Scan PDF</h2>
            {!loading && (
              <button
                onClick={handleClose}
                className="p-1 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            )}
          </div>
          <p className="text-[#444746] text-sm mb-6">
            Upload a PDF to convert it to readable text using AI.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 mb-4">
            {/* Drop zone */}
            {!file ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-reader-active hover:bg-reader-active/5 transition-all"
              >
                <Upload size={40} className="mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-2">Drag and drop a PDF here</p>
                <p className="text-gray-400 text-sm">or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center mb-4">
                  <FileText size={24} className="text-red-500 mr-3" />
                  <div className="flex-grow min-w-0">
                    <p className="font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  {!loading && (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setTitle('');
                      }}
                      className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <X size={18} className="text-gray-400" />
                    </button>
                  )}
                </div>

                {/* Title input */}
                <div className="mb-2">
                  <label className="block text-sm text-gray-600 mb-1">Document Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter a title..."
                    disabled={loading}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-reader-active focus:border-transparent text-sm disabled:bg-gray-50"
                  />
                </div>

                {/* Progress indicator */}
                {progress && (
                  <div className="mt-4 bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center text-sm">
                      {progress.status === 'completed' ? (
                        <CheckCircle2 size={16} className="text-green-500 mr-2" />
                      ) : (
                        <Loader2 size={16} className="animate-spin text-reader-active mr-2" />
                      )}
                      <span className="text-gray-700">{progress.message}</span>
                    </div>
                    {progress.totalPages && progress.currentPage && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>
                            {progress.currentChunk && progress.totalChunks && progress.totalChunks > 1
                              ? `Chunk ${progress.currentChunk}/${progress.totalChunks}`
                              : `Page ${progress.currentPage}/${progress.totalPages}`
                            }
                          </span>
                          <span>
                            {Math.round((progress.currentPage / progress.totalPages) * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-reader-active transition-all duration-300"
                            style={{
                              width: `${(progress.currentPage / progress.totalPages) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="text-reader-red text-sm mt-3 px-1">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-6 flex justify-end space-x-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-reader-active font-medium text-sm rounded-full hover:bg-reader-active/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file}
              className="px-6 py-2 bg-reader-active text-white font-medium text-sm rounded-full shadow-sm hover:shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center"
            >
              {loading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              {loading ? 'Processing...' : 'Scan PDF'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
