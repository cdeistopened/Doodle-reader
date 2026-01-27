import React, { useState, useEffect } from 'react';
import { Loader2, X, Mail, Copy, Check } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';

interface AddNewsletterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CreatedFeed {
  name: string;
  email: string;
  feedUrl: string;
}

/**
 * Creates a newsletter feed via local proxy to kill-the-newsletter.com
 * Uses /api/newsletter to avoid CORS and Cloudflare issues
 */
async function createKillTheNewsletterFeed(name: string): Promise<{ email: string; feedUrl: string }> {
  const response = await fetch("/api/newsletter", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error || `Failed to create newsletter feed: ${response.status}`);
  }

  return response.json();
}

export const AddNewsletterModal: React.FC<AddNewsletterModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdFeed, setCreatedFeed] = useState<CreatedFeed | null>(null);
  const [copied, setCopied] = useState(false);

  const saveNewsletterFeed = useMutation(api.newsletters.saveNewsletterFeed);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setError(null);
      setCreatedFeed(null);
      setCopied(false);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create feed via kill-the-newsletter.com (browser-side)
      const { email, feedUrl } = await createKillTheNewsletterFeed(name.trim());

      // Step 2: Save to Convex database
      await saveNewsletterFeed({
        name: name.trim(),
        email,
        feedUrl,
      });

      setCreatedFeed({
        name: name.trim(),
        email,
        feedUrl,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create newsletter feed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyEmail = async () => {
    if (!createdFeed) return;

    try {
      await navigator.clipboard.writeText(createdFeed.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = createdFeed.email;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDone = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity p-4 animate-fade-in">
      <div className="bg-surface w-full max-w-md border-2 border-ink rounded-lg shadow-brutal overflow-hidden font-sans">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-ink">
            {createdFeed ? 'Newsletter Created' : 'Add Newsletter'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-cream-warm rounded-md transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        {!createdFeed ? (
          <form onSubmit={handleSubmit}>
            <div className="p-5">
              <p className="text-ink-muted text-sm mb-4">
                Create an email address to subscribe to newsletters. We'll convert incoming emails to an RSS feed.
              </p>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-ink-muted" strokeWidth={1.5} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Newsletter name (e.g., Tech Weekly)"
                  className="block w-full pl-10 pr-4 py-3 border-2 border-border rounded-md bg-surface text-ink placeholder-ink-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft text-sm transition-all"
                  autoFocus
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="text-status-error text-sm mt-3 flex items-start">
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 bg-cream-warm border-t border-border flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-ink font-medium text-sm rounded-md border-2 border-border hover:border-ink hover:bg-cream transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="px-5 py-2 bg-accent text-white font-medium text-sm rounded-md border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none disabled:transform-none transition-all flex items-center"
              >
                {loading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                {loading ? 'Creating...' : 'Create Email'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="p-5">
              <div className="p-4 bg-status-success/10 border-2 border-status-success/30 rounded-md mb-4">
                <div className="flex items-center gap-2 text-status-success text-sm font-medium mb-2">
                  <Check size={16} strokeWidth={2} />
                  Newsletter feed created!
                </div>
                <p className="text-ink-muted text-xs">
                  Subscribe to newsletters using the email below. Emails will appear in your RSS feed.
                </p>
              </div>

              <label className="block text-sm font-medium text-ink mb-2">
                Your newsletter email
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createdFeed.email}
                  readOnly
                  className="flex-1 px-4 py-3 border-2 border-border rounded-md bg-cream text-ink text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className={`px-4 py-2 font-medium text-sm rounded-md border-2 transition-all flex items-center gap-2 ${
                    copied
                      ? 'bg-status-success/10 border-status-success/30 text-status-success'
                      : 'border-border hover:border-ink hover:bg-cream text-ink'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check size={16} strokeWidth={2} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={16} strokeWidth={1.5} />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <p className="text-ink-muted text-xs mt-3">
                Feed URL: <span className="font-mono">{createdFeed.feedUrl}</span>
              </p>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 bg-cream-warm border-t border-border flex justify-end">
              <button
                type="button"
                onClick={handleDone}
                className="px-5 py-2 bg-accent text-white font-medium text-sm rounded-md border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
