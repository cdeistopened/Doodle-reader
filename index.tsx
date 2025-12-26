import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';

// Get Clerk publishable key from environment
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Check if key is valid (not empty, not a placeholder)
const isValidClerkKey = clerkPubKey &&
  !clerkPubKey.includes('YOUR_') &&
  clerkPubKey.startsWith('pk_');

const container = document.getElementById('root');
const root = createRoot(container!);

// If Clerk key is configured, wrap with ClerkProvider
// Otherwise run without auth (local-only mode)
if (isValidClerkKey) {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPubKey}>
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
} else {
  // No Clerk key - run in local-only mode
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
