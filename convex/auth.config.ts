/**
 * Convex Auth Configuration for Clerk
 *
 * This file configures Convex to validate Clerk JWTs.
 * The domain should match your Clerk Frontend API.
 */

export default {
  providers: [
    {
      // Clerk's issuer domain - get this from Clerk Dashboard > API Keys
      // It should be something like: https://your-app.clerk.accounts.dev
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
