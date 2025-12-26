import React from 'react';
import { useClerk, SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';

/**
 * Auth button that only renders when Clerk is configured.
 * Shows Sign In button when logged out, UserButton when logged in.
 */
export const AuthButton: React.FC = () => {
  // Check if we're inside ClerkProvider by trying to use the hook
  try {
    // This will throw if not in ClerkProvider context
    useClerk();
  } catch {
    // No Clerk configured - show nothing
    return null;
  }

  return (
    <div className="ml-3 pl-3 border-l border-border">
      <SignedOut>
        <SignInButton mode="modal">
          <button className="text-sm font-medium text-ink-soft hover:text-accent transition-colors">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8"
            }
          }}
        />
      </SignedIn>
    </div>
  );
};
