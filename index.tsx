import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexStorageProvider } from './lib/storage/convex-provider';
import { DigestOverview } from './components/DigestOverview';
import { DigestReader } from './components/DigestReader';
import { FirstDigestSetup } from './components/FirstDigestSetup';
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

type PublicDigestRoute =
  | { kind: 'overview'; digestRunId: string }
  | { kind: 'reader'; digestRunId: string; itemIndex: number };

function parsePublicDigestRoute(pathname: string): PublicDigestRoute | null {
  const readerMatch = pathname.match(/^\/read\/([^/]+)\/(\d+)\/?$/);
  if (readerMatch) {
    return {
      kind: 'reader',
      digestRunId: decodeURIComponent(readerMatch[1]),
      itemIndex: Number.parseInt(readerMatch[2], 10),
    };
  }

  const digestMatch = pathname.match(/^\/digest\/([^/]+)\/?$/);
  if (digestMatch) {
    return {
      kind: 'overview',
      digestRunId: decodeURIComponent(digestMatch[1]),
    };
  }

  return null;
}

function PublicDigestApp({ route }: { route: PublicDigestRoute }) {
  if (route.kind === 'overview') {
    return <DigestOverview digestRunId={route.digestRunId} />;
  }

  return <DigestReader digestRunId={route.digestRunId} itemIndex={route.itemIndex} />;
}

const publicDigestRoute = parsePublicDigestRoute(window.location.pathname);
const isFirstDigestRoute = /^\/first-digest\/?$/.test(window.location.pathname);

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

if (publicDigestRoute) {
  if (!convex) {
    root.render(
      <React.StrictMode>
        <div className="min-h-screen bg-cream flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-serif text-ink mb-3">Public reader unavailable</h1>
            <p className="text-ink-muted">
              `VITE_CONVEX_URL` is not configured, so this digest page cannot load.
            </p>
          </div>
        </div>
      </React.StrictMode>
    );
  } else {
    root.render(
      <React.StrictMode>
        <ConvexProvider client={convex}>
          <PublicDigestApp route={publicDigestRoute} />
        </ConvexProvider>
      </React.StrictMode>
    );
  }
} else if (isFirstDigestRoute) {
  if (!isValidClerkKey || !convex) {
    root.render(
      <React.StrictMode>
        <div className="min-h-screen bg-cream flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-serif text-ink mb-3">Setup unavailable</h1>
            <p className="text-ink-muted">
              `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL` must be configured.
            </p>
          </div>
        </div>
      </React.StrictMode>
    );
  } else {
    root.render(
      <React.StrictMode>
        <ClerkProvider publishableKey={clerkPubKey}>
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <FirstDigestSetup />
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </React.StrictMode>
    );
  }
} else if (isValidClerkKey && convex) {
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
