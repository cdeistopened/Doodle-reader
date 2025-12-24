import { FeedItem, FeedSource, Folder } from './types';
import { Rss, Code, Globe, Zap, Cpu } from 'lucide-react';
import React from 'react';

// Using functional components for icons to be used in standard React renders
export const Icons = {
  Rss: () => <Rss size={14} strokeWidth={2} />,
  Folder: () => <div className="w-3 h-3 bg-reader-folder opacity-50 mr-1" />, 
  StarEmpty: () => <div className="w-4 h-4 border border-gray-300 rounded-sm" />,
  StarFilled: () => <div className="w-4 h-4 bg-reader-gold border border-yellow-600 rounded-sm" />,
};

export const SOURCES: Record<string, FeedSource> = {
  'tc': { id: 'tc', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', siteUrl: 'https://techcrunch.com', color: '#00A562', folderId: 'tech' },
  'hn': { id: 'hn', name: 'Hacker News', url: 'https://news.ycombinator.com/rss', siteUrl: 'https://news.ycombinator.com', color: '#FF6600', folderId: 'tech' },
  'daring': { id: 'daring', name: 'Daring Fireball', url: 'https://daringfireball.net/feeds/main', siteUrl: 'https://daringfireball.net', color: '#4A525A', folderId: 'indie' },
  'verge': { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', siteUrl: 'https://www.theverge.com', color: '#E91C63', folderId: 'tech' },
  'wired': { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/rss', siteUrl: 'https://www.wired.com', color: '#000000', folderId: 'tech' },
};

export const FOLDERS: Folder[] = [
  { id: 'tech', name: 'Tech News', isOpen: true },
  { id: 'indie', name: 'Indie Web', isOpen: true },
];

const generateItems = (count: number): FeedItem[] => {
  const items: FeedItem[] = [];
  const now = Date.now();
  
  const titles = [
    "Google Announces New AI Model for Coding",
    "Apple Vision Pro Review: The Future is Heavy",
    "Why Rust is Eating the Infrastructure World",
    "The End of the Open Web?",
    "Linux Kernel 6.8 Released with New Schedulers",
    "Understanding React Server Components",
    "Startup raises $50M to replace Excel with Chatbots",
    "Nintendo Switch 2 Rumors Heat Up",
    "SpaceX Starship Launch Scheduled for Tuesday",
    "CSS Container Queries are Finally Here"
  ];

  const authors = ["Alex Tech", "Sarah Coder", "John Doe", "Jane Smith", "Editor"];

  for (let i = 0; i < count; i++) {
    const sourceKeys = Object.keys(SOURCES);
    const sourceKey = sourceKeys[i % sourceKeys.length];
    const source = SOURCES[sourceKey];
    const isRead = i > 15; // First 15 are unread

    items.push({
      id: `item-${i}`,
      feedId: source.id,
      title: titles[i % titles.length] + ` (Update ${i})`,
      author: authors[i % authors.length],
      snippet: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam...",
      content: `<p>This is the full content view for the article. In the <strong>Classic Reader</strong> experience, this would be the "Expanded" view.</p>
                <p>It allows for reading the entire RSS entry without leaving the application context. This was often used for "River of News" style consumption.</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>`,
      url: 'https://example.com',
      timestamp: now - (i * 3600000), // Decrement by hour
      isRead: isRead,
      isStarred: i === 3 || i === 8,
    });
  }
  return items;
};

export const MOCK_ITEMS = generateItems(100);