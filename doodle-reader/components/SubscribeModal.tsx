import React, { useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe: (url: string) => Promise<void>;
}

export const SubscribeModal: React.FC<SubscribeModalProps> = ({ isOpen, onClose, onSubscribe }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await onSubscribe(url);
      setUrl('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not find feed. Try checking the URL.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity p-4">
      {/* Material 3 Dialog Container */}
      <div className="bg-[#F7F9FC] w-full max-w-[560px] rounded-[28px] shadow-xl overflow-hidden font-sans transform transition-all">
        
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl text-[#1F1F1F] font-normal font-sans">Subscribe</h2>
          </div>
          <p className="text-[#444746] text-sm mb-6">
            Enter a website URL, an RSS link, or a YouTube channel URL.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 mb-2">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-reader-active" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste URL or search..."
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-t-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-reader-active focus:border-transparent sm:text-base transition-all rounded-b-lg h-[56px]"
                autoFocus
              />
            </div>
            {error && (
              <div className="text-reader-red text-sm mt-2 px-1 flex items-start">
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="px-6 py-6 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-reader-active font-medium text-sm rounded-full hover:bg-reader-active/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-reader-active text-white font-medium text-sm rounded-full shadow-sm hover:shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center"
            >
              {loading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Subscribe
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};