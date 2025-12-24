import React, { useState, useRef } from 'react';
import { Loader2, FileText, Upload, X, CheckCircle2, Folder, Info, DollarSign, Clock, FileText as DocumentIcon } from 'lucide-react';
import { processPDF, titleFromFilename, type OCRProgress, type DocumentAnalysis } from '../lib/ocr';

interface FolderScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (results: Array<{
    title: string;
    content: string;
    metadata: {
      pageCount: number;
      fileSizeMB: number;
      processingTimeMs: number;
    };
    fileName: string;
  }>) => Promise<void>;
}

interface QueuedFile {
  file: File;
  title: string;
  analysis?: DocumentAnalysis;
  status: 'pending' | 'analyzing' | 'processing' | 'completed' | 'error';
  result?: {
    content: string;
    metadata: {
      pageCount: number;
      fileSizeMB: number;
      processingTimeMs: number;
    };
  };
  error?: string;
}

export const FolderScanModal: React.FC<FolderScanModalProps> = ({ isOpen, onClose, onScanComplete }) => {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OCRProgress | null>(null);
  const [overallProgress, setOverallProgress] = useState({ completed: 0, total: 0 });
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(file => file.type === 'application/pdf');
    
    if (selectedFiles.length === 0) {
      setError('Please select a folder containing PDF files');
      return;
    }

    const queuedFiles = selectedFiles.map(file => ({
      file,
      title: titleFromFilename(file.name),
      status: 'pending' as const
    }));

    setFiles(queuedFiles);
    setError(null);
    setOverallProgress({ completed: 0, total: queuedFiles.length });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files || []).filter(file => file.type === 'application/pdf');
    
    if (droppedFiles.length === 0) {
      setError('Please drop PDF files');
      return;
    }

    const queuedFiles = droppedFiles.map(file => ({
      file,
      title: titleFromFilename(file.name),
      status: 'pending' as const
    }));

    setFiles(prev => [...prev, ...queuedFiles]);
    setError(null);
    setOverallProgress(prev => ({ completed: prev.completed, total: prev.total + queuedFiles.length }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const updateFileStatus = (fileIndex: number, updates: Partial<QueuedFile>) => {
    setFiles(prev => prev.map((file, idx) => 
      idx === fileIndex ? { ...file, ...updates } : file
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setLoading(true);
    setError(null);
    setProgress(null);

    try {
      const results = [];

      for (let i = 0; i < files.length; i++) {
        const queuedFile = files[i];
        
        try {
          // Update status to analyzing
          updateFileStatus(i, { status: 'analyzing' });
          
          // Process with analysis enabled
          const result = await processPDF(queuedFile.file, (progress) => {
            setProgress({
              ...progress,
              currentFile: queuedFile.file.name,
              totalFiles: files.length,
              currentPage: progress.currentPage || 0,
              totalPages: progress.totalPages || 1,
              currentChunk: progress.currentChunk || 1,
              totalChunks: progress.totalChunks || 1,
            });
          }, true);

          updateFileStatus(i, { 
            status: 'completed',
            result: {
              content: result.content,
              metadata: {
                pageCount: result.pageCount,
                fileSizeMB: result.fileSizeMB,
                processingTimeMs: result.processingTimeMs,
              }
            },
            analysis: result.analysis
          });

          results.push({
            title: queuedFile.title,
            content: result.content,
            metadata: {
              pageCount: result.pageCount,
              fileSizeMB: result.fileSizeMB,
              processingTimeMs: result.processingTimeMs,
            },
            fileName: queuedFile.file.name
          });

          // Update overall progress
          setOverallProgress(prev => ({ ...prev, completed: i + 1 }));

        } catch (err: any) {
          updateFileStatus(i, { 
            status: 'error', 
            error: err.message || 'Failed to process PDF' 
          });
        }
      }

      await onScanComplete(results);

      // Reset state
      setFiles([]);
      setOverallProgress({ completed: 0, total: 0 });
      setProgress(null);
      onClose();

    } catch (err: any) {
      setError(err.message || 'Failed to process PDFs');
    } finally {
      setLoading(false);
    }
  };

  const removeFile = (index: number) => {
    if (!loading) {
      const newFiles = files.filter((_, idx) => idx !== index);
      setFiles(newFiles);
      setOverallProgress(prev => ({ 
        completed: prev.completed - (files[index].status === 'completed' ? 1 : 0), 
        total: newFiles.length 
      }));
    }
  };

  const updateFileTitle = (index: number, title: string) => {
    updateFileStatus(index, { title });
  };

  const totalEstimatedCost = files.reduce((sum, file) => 
    sum + (file.analysis?.costEstimate.cost || 0), 0
  );

  const totalEstimatedTokens = files.reduce((sum, file) => 
    sum + (file.analysis?.estimatedTokens || 0), 0
  );

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2);
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const getStatusIcon = (status: QueuedFile['status']) => {
    switch (status) {
      case 'analyzing':
      case 'processing':
        return <Loader2 size={16} className="animate-spin text-reader-active" />;
      case 'completed':
        return <CheckCircle2 size={16} className="text-green-500" />;
      case 'error':
        return <X size={16} className="text-red-500" />;
      default:
        return <DocumentIcon size={16} className="text-gray-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity p-4">
      <div className="bg-[#F7F9FC] w-full max-w-4xl max-h-[90vh] rounded-[28px] shadow-xl overflow-hidden font-sans transform transition-all flex flex-col">

        <div className="p-6 pb-0 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl text-[#1F1F1F] font-normal font-sans">Scan PDFs</h2>
            {!loading && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            )}
          </div>
          <p className="text-[#444746] text-sm">
            Upload PDF files or a folder to convert them to readable text using AI with intelligent cost estimation.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 py-4 flex-1 overflow-auto">
            {/* Drop zone */}
            {files.length === 0 ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => folderInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-reader-active hover:bg-reader-active/5 transition-all"
              >
                <Folder size={48} className="mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-2 text-lg">Drag and drop PDF files here</p>
                <p className="text-gray-400 text-sm mb-4">or click to browse and select multiple files</p>
                <input
                  ref={folderInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={handleFolderSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Cost Summary */}
                {files.some(f => f.analysis) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start space-x-3">
                      <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-medium text-blue-900 mb-2">Estimated Cost & Time</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-center">
                            <DollarSign size={16} className="text-blue-600 mr-1" />
                            <span className="text-blue-800">
                              ${totalEstimatedCost.toFixed(4)}
                            </span>
                          </div>
                          <div className="text-blue-800">
                            {totalEstimatedTokens.toLocaleString()} tokens
                          </div>
                          <div className="flex items-center">
                            <Clock size={16} className="text-blue-600 mr-1" />
                            <span className="text-blue-800">
                              {formatTime(files.reduce((sum, f) => 
                                sum + (f.analysis?.costEstimate.processingTime || 0), 0
                              ))}
                            </span>
                          </div>
                          <div className="text-blue-800">
                            {files.length} files
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* File list */}
                <div className="space-y-2">
                  {files.map((queuedFile, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start space-x-3">
                        <div className="mt-1">
                          {getStatusIcon(queuedFile.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1 min-w-0 mr-4">
                              <input
                                type="text"
                                value={queuedFile.title}
                                onChange={(e) => updateFileTitle(index, e.target.value)}
                                disabled={loading || queuedFile.status === 'processing' || queuedFile.status === 'analyzing'}
                                className="block w-full px-3 py-1 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-reader-active focus:border-transparent text-sm disabled:bg-gray-50"
                                placeholder="Enter document title..."
                              />
                              <p className="text-xs text-gray-500 mt-1 truncate">
                                {queuedFile.file.name} • {formatFileSize(queuedFile.file.size)} MB
                              </p>
                            </div>
                            {!loading && (
                              <button
                                type="button"
                                onClick={() => removeFile(index)}
                                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                              >
                                <X size={16} className="text-gray-400" />
                              </button>
                            )}
                          </div>

                          {/* Analysis results */}
                          {queuedFile.analysis && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-xs text-gray-600">
                              <div>
                                <span className="font-medium">Pages:</span> {queuedFile.analysis.pageCount}
                              </div>
                              <div>
                                <span className="font-medium">Type:</span> {queuedFile.analysis.contentType}
                              </div>
                              <div>
                                <span className="font-medium">Quality:</span> {queuedFile.analysis.quality}
                              </div>
                              <div>
                                <span className="font-medium">Tokens:</span> {queuedFile.analysis.estimatedTokens.toLocaleString()}
                              </div>
                              <div>
                                <span className="font-medium">Cost:</span> ${queuedFile.analysis.costEstimate.cost.toFixed(4)}
                              </div>
                              <div>
                                <span className="font-medium">Time:</span> {formatTime(queuedFile.analysis.costEstimate.processingTime)}
                              </div>
                            </div>
                          )}

                          {/* Error display */}
                          {queuedFile.error && (
                            <div className="text-red-500 text-sm mt-2">
                              {queuedFile.error}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add more files button */}
                {!loading && (
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-reader-active hover:text-reader-active transition-colors"
                  >
                    + Add more files
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="text-reader-red text-sm mt-3">
                {error}
              </div>
            )}
          </div>

          {/* Progress indicator */}
          {progress && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  {progress.status === 'completed' ? (
                    <CheckCircle2 size={16} className="text-green-500 mr-2" />
                  ) : (
                    <Loader2 size={16} className="animate-spin text-reader-active mr-2" />
                  )}
                  <span className="text-gray-700 truncate flex-1">
                    {progress.currentFile && `Processing ${progress.currentFile}...`}
                    {progress.message}
                  </span>
                  {progress.totalPages && progress.currentPage && (
                    <span className="text-gray-500 ml-2 flex-shrink-0">
                      {Math.round((progress.currentPage / progress.totalPages) * 100)}%
                    </span>
                  )}
                </div>
                
                {progress.totalPages && progress.currentPage && (
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-reader-active transition-all duration-300"
                      style={{
                        width: `${(progress.currentPage / progress.totalPages) * 100}%`,
                      }}
                    />
                  </div>
                )}

                {/* Overall progress */}
                {overallProgress.total > 1 && (
                  <div className="text-xs text-gray-500 mt-2">
                    Overall: {overallProgress.completed}/{overallProgress.total} files completed
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="px-6 py-6 border-t border-gray-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-reader-active font-medium text-sm rounded-full hover:bg-reader-active/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || files.length === 0}
              className="px-6 py-2 bg-reader-active text-white font-medium text-sm rounded-full shadow-sm hover:shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center"
            >
              {loading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              {loading ? 'Processing...' : `Scan ${files.length} PDF${files.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
