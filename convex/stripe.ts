/**
 * Stripe Integration for Doodle Reader
 *
 * Handles subscription management, checkout sessions, and webhook processing.
 * Uses Convex HTTP actions for webhook endpoints.
 *
 * Required environment variables (set via `npx convex env set`):
 * - STRIPE_SECRET_KEY: Your Stripe secret key (sk_live_... or sk_test_...)
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret (whsec_...)
 * - STRIPE_PRICE_PRO_MONTHLY: Price ID for Pro monthly plan
 * - STRIPE_PRICE_PRO_YEARLY: Price ID for Pro yearly plan
 */

import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// PLAN CONFIGURATION
// =============================================================================

export const PLANS = {
  free: {
    name: "Free",
    transcriptionMinutes: 30,
    summariesPerMonth: 10,
    pdfPages: 50,
  },
  pro: {
    name: "Pro",
    transcriptionMinutes: 500,
    summariesPerMonth: -1, // unlimited
    pdfPages: -1, // unlimited
  },
  team: {
    name: "Team",
    transcriptionMinutes: 2000,
    summariesPerMonth: -1,
    pdfPages: -1,
  },
} as const;

export type PlanType = keyof typeof PLANS;

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get the current user's subscription status
 */
export const getSubscription = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const userId = identity.subject;
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!subscription) {
      // Return default free tier
      return {
        plan: "free" as const,
        status: "free" as const,
        limits: PLANS.free,
      };
    }

    return {
      ...subscription,
      limits: PLANS[subscription.plan],
    };
  },
});

/**
 * Get current month's usage for the user
 */
export const getUsage = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const userId = identity.subject;
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM

    const usage = await ctx.db
      .query("usage")
      .withIndex("by_user_period", (q) => q.eq("userId", userId).eq("period", period))
      .first();

    return usage || {
      transcriptionMinutes: 0,
      summariesGenerated: 0,
      pdfPagesScanned: 0,
    };
  },
});

/**
 * Check if user can perform an action based on their plan limits
 */
export const checkUsageLimit = query({
  args: {
    action: v.union(
      v.literal("transcribe"),
      v.literal("summarize"),
      v.literal("scan")
    ),
    amount: v.optional(v.number()), // e.g., minutes for transcription
  },
  handler: async (ctx, { action, amount = 1 }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { allowed: false, reason: "Not authenticated" };
    }

    const userId = identity.subject;
    const period = new Date().toISOString().slice(0, 7);

    // Get subscription
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const plan = subscription?.plan || "free";
    const limits = PLANS[plan];

    // Get current usage
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_user_period", (q) => q.eq("userId", userId).eq("period", period))
      .first();

    const currentUsage = usage || {
      transcriptionMinutes: 0,
      summariesGenerated: 0,
      pdfPagesScanned: 0,
    };

    // Check limits
    switch (action) {
      case "transcribe": {
        const limit = limits.transcriptionMinutes;
        const remaining = limit - currentUsage.transcriptionMinutes;
        if (remaining < amount) {
          return {
            allowed: false,
            reason: `Transcription limit reached (${currentUsage.transcriptionMinutes}/${limit} minutes used)`,
            remaining,
            limit,
          };
        }
        return { allowed: true, remaining, limit };
      }
      case "summarize": {
        const limit = limits.summariesPerMonth;
        if (limit === -1) return { allowed: true };
        if (currentUsage.summariesGenerated >= limit) {
          return {
            allowed: false,
            reason: `Summary limit reached (${currentUsage.summariesGenerated}/${limit})`,
            remaining: 0,
            limit,
          };
        }
        return { allowed: true, remaining: limit - currentUsage.summariesGenerated, limit };
      }
      case "scan": {
        const limit = limits.pdfPages;
        if (limit === -1) return { allowed: true };
        const remaining = limit - currentUsage.pdfPagesScanned;
        if (remaining < amount) {
          return {
            allowed: false,
            reason: `PDF scan limit reached (${currentUsage.pdfPagesScanned}/${limit} pages)`,
            remaining,
            limit,
          };
        }
        return { allowed: true, remaining, limit };
      }
    }
  },
});

// =============================================================================
// INTERNAL MUTATIONS (called by actions/webhooks)
// =============================================================================

export const createOrUpdateSubscription = internalMutation({
  args: {
    userId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    status: v.union(
      v.literal("free"),
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("unpaid")
    ),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("team")),
    currentPeriodStart: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.string()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const now = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updated: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("subscriptions", {
        ...args,
        created: now,
        updated: now,
      });
    }
  },
});

export const recordUsage = internalMutation({
  args: {
    userId: v.string(),
    transcriptionMinutes: v.optional(v.number()),
    summariesGenerated: v.optional(v.number()),
    pdfPagesScanned: v.optional(v.number()),
  },
  handler: async (ctx, { userId, ...deltas }) => {
    const period = new Date().toISOString().slice(0, 7);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("usage")
      .withIndex("by_user_period", (q) => q.eq("userId", userId).eq("period", period))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        transcriptionMinutes: existing.transcriptionMinutes + (deltas.transcriptionMinutes || 0),
        summariesGenerated: existing.summariesGenerated + (deltas.summariesGenerated || 0),
        pdfPagesScanned: existing.pdfPagesScanned + (deltas.pdfPagesScanned || 0),
        updated: now,
      });
    } else {
      await ctx.db.insert("usage", {
        userId,
        period,
        transcriptionMinutes: deltas.transcriptionMinutes || 0,
        summariesGenerated: deltas.summariesGenerated || 0,
        pdfPagesScanned: deltas.pdfPagesScanned || 0,
        updated: now,
      });
    }
  },
});

export const getSubscriptionByStripeCustomer = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, { stripeCustomerId }) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_customer", (q) => q.eq("stripeCustomerId", stripeCustomerId))
      .first();
  },
});

// =============================================================================
// ACTIONS (server-side with Stripe API access)
// =============================================================================

/**
 * Create a Stripe Checkout session for subscription
 */
export const createCheckoutSession = action({
  args: {
    priceId: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, { priceId, successUrl, cancelUrl }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error("Stripe not configured");
    }

    const userId = identity.subject;
    const email = identity.email;

    // Check if user already has a Stripe customer ID
    const existingSubscription = await ctx.runQuery(internal.stripe.getSubscriptionByStripeCustomer, {
      stripeCustomerId: "", // We'll need a different query
    });

    // Create checkout session via Stripe API
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": "subscription",
        "payment_method_types[0]": "card",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        "success_url": successUrl,
        "cancel_url": cancelUrl,
        "client_reference_id": userId,
        ...(email ? { "customer_email": email } : {}),
        "metadata[userId]": userId,
        "subscription_data[metadata][userId]": userId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Stripe error:", error);
      throw new Error("Failed to create checkout session");
    }

    const session = await response.json();
    return { url: session.url, sessionId: session.id };
  },
});

/**
 * Create a Stripe Customer Portal session for managing subscription
 */
export const createPortalSession = action({
  args: {
    returnUrl: v.string(),
  },
  handler: async (ctx, { returnUrl }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error("Stripe not configured");
    }

    const userId = identity.subject;

    // Get user's Stripe customer ID from subscription
    // For now, we'll need to look this up
    // In practice, you'd store the customer ID when created

    throw new Error("Portal session requires existing customer ID - implement after first subscription");
  },
});

/**
 * Increment usage for a specific action (called after AI operations)
 */
export const incrementUsage = action({
  args: {
    action: v.union(
      v.literal("transcribe"),
      v.literal("summarize"),
      v.literal("scan")
    ),
    amount: v.number(),
  },
  handler: async (ctx, { action, amount }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    const usageUpdate: {
      transcriptionMinutes?: number;
      summariesGenerated?: number;
      pdfPagesScanned?: number;
    } = {};

    switch (action) {
      case "transcribe":
        usageUpdate.transcriptionMinutes = amount;
        break;
      case "summarize":
        usageUpdate.summariesGenerated = amount;
        break;
      case "scan":
        usageUpdate.pdfPagesScanned = amount;
        break;
    }

    await ctx.runMutation(internal.stripe.recordUsage, {
      userId,
      ...usageUpdate,
    });
  },
});
