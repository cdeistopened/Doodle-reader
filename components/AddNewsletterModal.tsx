import React, { useState, useEffect } from 'react';
import { Loader2, X, Mail, ExternalLink } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';

interface AddNewsletterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Parse a kill-the-newsletter email to extract the feed URL
 */
function parseNewsletterEmail(email: string): { email: string; feedUrl: string } | null {
  const trimmed = email.trim().toLowerCase();
  const match = trimmed.match(/^([a-z0-9]+)@kill-the-newsletter\.com$/);
  if (!match) return null;

  const publicId = match[1];
  return {
    email: trimmed,
    feedUrl: `https://kill-the-newsletter.com/feeds/${publicId}.xml`,
  };
}

export const AddNewsletterModal: React.FC<AddNewsletterModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveNewsletterFeed = useMutation(api.newsletters.saveNewsletterFeed);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setEmail('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    // Parse and validate the email
    const parsed = parseNewsletterEmail(email);
    if (!parsed) {
      setError('Please enter a valid kill-the-newsletter.com email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await saveNewsletterFeed({
        name: name.trim(),
        email: parsed.email,
        feedUrl: parsed.feedUrl,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save newsletter feed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity p-4 animate-fade-in">
      <div className="bg-surface w-full max-w-md border-2 border-ink rounded-lg shadow-brutal overflow-hidden font-sans">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-ink">
            Add Newsletter
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-cream-warm rounded-md transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-5">
            <p className="text-ink-muted text-sm mb-4">
              Create a free email address at{' '}
              <a
                href="https://kill-the-newsletter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                kill-the-newsletter.com
                <ExternalLink size={12} />
              </a>
              , then paste it below.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Newsletter name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Tech Weekly"
                  className="block w-full px-4 py-3 border-2 border-border rounded-md bg-surface text-ink placeholder-ink-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft text-sm transition-all"
                  autoFocus
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Kill the Newsletter email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-ink-muted" strokeWidth={1.5} />
                  </div>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="abc123@kill-the-newsletter.com"
                    className="block w-full pl-10 pr-4 py-3 border-2 border-border rounded-md bg-surface text-ink placeholder-ink-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft text-sm font-mono transition-all"
                    disabled={loading}
                  />
                </div>
              </div>
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
              disabled={loading || !name.trim() || !email.trim()}
              className="px-5 py-2 bg-accent text-white font-medium text-sm rounded-md border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none disabled:transform-none transition-all flex items-center"
            >
              {loading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              {loading ? 'Adding...' : 'Add Newsletter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
