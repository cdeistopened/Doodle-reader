import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexStorageProvider } from './lib/storage/convex-provider';
import App from './App';

// Get environment variables
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const convexUrl = import.meta.env.VITE_CONVEX_URL;

// Check if keys are valid
const isValidClerkKey = clerkPubKey &&
  !clerkPubKey.includes('YOUR_') &&
  clerkPubKey.startsWith('pk_');

const isValidConvexUrl = convexUrl &&
  !convexUrl.includes('YOUR_') &&
  convexUrl.includes('.convex.cloud');

// Create Convex client if URL is configured
const convex = isValidConvexUrl ? new ConvexReactClient(convexUrl) : null;

const container = document.getElementById('root');
const root = createRoot(container!);

/**
 * Storage Modes:
 * - 'hybrid': Local IndexedDB for feeds/articles (fast), Convex for saved content (when authenticated)
 * - 'local': Pure IndexedDB, no cloud sync
 * - 'convex': All data in Convex (legacy, not recommended - slow for large feeds)
 *
 * Hybrid mode is the default when Clerk + Convex are configured.
 * It provides the best UX: instant feed loading, works without login,
 * and cloud sync only when user explicitly saves/transcribes content.
 */

if (isValidClerkKey && convex) {
  // Hybrid mode: Local for feeds, Convex for saved content when authenticated
  // Best of both worlds - fast local reads, cloud persistence for saved items
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPubKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <ConvexStorageProvider>
            <App storageMode="hybrid" />
          </ConvexStorageProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </React.StrictMode>
  );
} else if (isValidClerkKey) {
  // Clerk auth but no Convex - local storage with auth for future features
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPubKey}>
        <App storageMode="local" />
      </ClerkProvider>
    </React.StrictMode>
  );
} else {
  // Full local-only mode - no auth, IndexedDB storage
  root.render(
    <React.StrictMode>
      <App storageMode="local" />
    </React.StrictMode>
  );
}
