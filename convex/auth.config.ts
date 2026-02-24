/**
 * Convex Auth Configuration for Clerk
 *
 * This file configures Convex to validate Clerk JWTs.
 * The domain should match your Clerk Frontend API.
 */

const providers: any[] = [];

// Only configure Clerk auth if the env var is set.
// This allows the digest engine to run without Clerk configured.
if (process.env.CLERK_JWT_ISSUER_DOMAIN) {
  providers.push({
    domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
    applicationID: "convex",
  });
}

export default { providers };
