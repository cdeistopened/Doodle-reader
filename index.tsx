import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
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

// Determine which mode to run in:
// 1. Full cloud mode: Clerk + Convex (both configured)
// 2. Local-only mode: IndexedDB storage (neither configured)
if (isValidClerkKey && convex) {
  // Full cloud mode with Clerk auth and Convex storage
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPubKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <App storageMode="convex" />
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </React.StrictMode>
  );
} else if (convex) {
  // Convex without auth (anonymous mode - not recommended for production)
  root.render(
    <React.StrictMode>
      <ConvexProvider client={convex}>
        <App storageMode="convex" />
      </ConvexProvider>
    </React.StrictMode>
  );
} else if (isValidClerkKey) {
  // Clerk auth but local storage (useful for auth-only features)
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
