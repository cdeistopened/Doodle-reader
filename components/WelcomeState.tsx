import React from 'react';
import { Rss, FileText, Youtube, Sparkles } from 'lucide-react';

interface WelcomeStateProps {
  onAddFeed: () => void;
  hasFeeds: boolean;
}

export const WelcomeState: React.FC<WelcomeStateProps> = ({ onAddFeed, hasFeeds }) => {
  if (hasFeeds) {
    return (
      <div className="flex-grow flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <p className="text-ink-muted text-lg">No items in this view.</p>
          <p className="text-ink-muted text-sm mt-2">Try selecting a different filter or adding more feeds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow flex items-center justify-center p-8 animate-fade-in">
      <div className="text-center max-w-lg">
        <h1 className="font-serif text-3xl font-semibold text-ink mb-3">
          Welcome to Doodle Reader
        </h1>
        <p className="text-ink-muted text-lg mb-8 leading-relaxed">
          Transform podcasts, articles, and videos into readable text. 
          Your content, polished and searchable.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-cream-warm rounded-lg border border-border">
            <Rss className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="text-sm text-ink-soft font-medium">RSS Feeds</p>
          </div>
          <div className="p-4 bg-cream-warm rounded-lg border border-border">
            <Youtube className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="text-sm text-ink-soft font-medium">YouTube</p>
          </div>
          <div className="p-4 bg-cream-warm rounded-lg border border-border">
            <FileText className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="text-sm text-ink-soft font-medium">PDF Scans</p>
          </div>
        </div>

        <button
          onClick={onAddFeed}
          className="bg-accent hover:bg-accent-muted text-white px-8 py-3 rounded-lg font-medium text-base border-2 border-ink shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all inline-flex items-center gap-2"
        >
          <Sparkles size={18} />
          Add Your First Feed
        </button>

        <p className="text-ink-muted text-sm mt-6">
          Paste an RSS URL, podcast feed, or YouTube channel
        </p>
      </div>
    </div>
  );
};
