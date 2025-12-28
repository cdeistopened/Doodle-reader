/**
 * Billing Hook
 *
 * Provides access to subscription status, usage limits, and checkout functions.
 */

import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface PlanLimits {
  transcriptionMinutes: number;
  summariesPerMonth: number;
  pdfPages: number;
}

export interface Subscription {
  plan: "free" | "pro" | "team";
  status: "free" | "trialing" | "active" | "past_due" | "canceled" | "unpaid";
  limits: PlanLimits;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface Usage {
  transcriptionMinutes: number;
  summariesGenerated: number;
  pdfPagesScanned: number;
}

export interface UsageLimitCheck {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  limit?: number;
}

export function useBilling() {
  const subscription = useQuery(api.stripe.getSubscription);
  const usage = useQuery(api.stripe.getUsage);
  const createCheckoutSession = useAction(api.stripe.createCheckoutSession);
  const incrementUsage = useAction(api.stripe.incrementUsage);

  const isPro = subscription?.plan === "pro" || subscription?.plan === "team";
  const isActive = subscription?.status === "active" || subscription?.status === "trialing";

  /**
   * Check if user can perform an action
   */
  const checkLimit = (
    action: "transcribe" | "summarize" | "scan",
    amount: number = 1
  ): UsageLimitCheck => {
    if (!subscription || !usage) {
      return { allowed: false, reason: "Loading..." };
    }

    const limits = subscription.limits;

    switch (action) {
      case "transcribe": {
        const limit = limits.transcriptionMinutes;
        const remaining = limit - usage.transcriptionMinutes;
        if (remaining < amount) {
          return {
            allowed: false,
            reason: `You've used ${usage.transcriptionMinutes} of ${limit} transcription minutes this month`,
            remaining,
            limit,
          };
        }
        return { allowed: true, remaining, limit };
      }
      case "summarize": {
        const limit = limits.summariesPerMonth;
        if (limit === -1) return { allowed: true };
        const remaining = limit - usage.summariesGenerated;
        if (remaining <= 0) {
          return {
            allowed: false,
            reason: `You've used all ${limit} AI summaries this month`,
            remaining: 0,
            limit,
          };
        }
        return { allowed: true, remaining, limit };
      }
      case "scan": {
        const limit = limits.pdfPages;
        if (limit === -1) return { allowed: true };
        const remaining = limit - usage.pdfPagesScanned;
        if (remaining < amount) {
          return {
            allowed: false,
            reason: `You've scanned ${usage.pdfPagesScanned} of ${limit} PDF pages this month`,
            remaining,
            limit,
          };
        }
        return { allowed: true, remaining, limit };
      }
    }
  };

  /**
   * Start checkout flow for a plan
   */
  const checkout = async (priceId: string) => {
    const baseUrl = window.location.origin;
    const result = await createCheckoutSession({
      priceId,
      successUrl: `${baseUrl}?subscription=success`,
      cancelUrl: `${baseUrl}?subscription=canceled`,
    });
    if (result.url) {
      window.location.href = result.url;
    }
    return result;
  };

  /**
   * Record usage after an AI operation
   */
  const trackUsage = async (
    action: "transcribe" | "summarize" | "scan",
    amount: number
  ) => {
    await incrementUsage({ action, amount });
  };

  return {
    // State
    subscription,
    usage,
    isPro,
    isActive,
    isLoading: subscription === undefined || usage === undefined,

    // Methods
    checkLimit,
    checkout,
    trackUsage,
  };
}

/**
 * Hook for checking a single limit before an action
 */
export function useUsageLimit(
  action: "transcribe" | "summarize" | "scan",
  amount: number = 1
) {
  const checkLimitQuery = useQuery(api.stripe.checkUsageLimit, { action, amount });
  return checkLimitQuery;
}
