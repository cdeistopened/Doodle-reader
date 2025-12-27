/**
 * Billing Utilities
 *
 * Helpers for checking limits and tracking usage in AI operations.
 * These can be used without React hooks for direct API calls.
 */

import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";

export type BillingAction = "transcribe" | "summarize" | "scan";

export interface UsageCheck {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  limit?: number;
}

/**
 * Check if a user can perform an action before making an expensive API call.
 * Returns immediately if not authenticated (allows action in local-only mode).
 */
export async function checkUsageBeforeAction(
  convex: ConvexReactClient | null,
  action: BillingAction,
  amount: number = 1
): Promise<UsageCheck> {
  // If no Convex client, we're in local-only mode - allow everything
  if (!convex) {
    return { allowed: true };
  }

  try {
    const result = await convex.query(api.stripe.checkUsageLimit, {
      action,
      amount,
    });
    return result || { allowed: true };
  } catch (error) {
    // If the query fails (e.g., not authenticated), allow the action
    // This supports local-only mode where there's no auth
    console.warn("Usage check failed, allowing action:", error);
    return { allowed: true };
  }
}

/**
 * Record usage after a successful AI operation.
 */
export async function recordUsageAfterAction(
  convex: ConvexReactClient | null,
  action: BillingAction,
  amount: number
): Promise<void> {
  if (!convex) return;

  try {
    await convex.action(api.stripe.incrementUsage, {
      action,
      amount,
    });
  } catch (error) {
    // Don't fail the operation if usage tracking fails
    console.warn("Failed to record usage:", error);
  }
}

/**
 * Wrap an async operation with usage checking and tracking.
 *
 * @example
 * const result = await withUsageTracking(
 *   convex,
 *   "transcribe",
 *   durationMinutes,
 *   () => transcribeAudio(audioUrl)
 * );
 */
export async function withUsageTracking<T>(
  convex: ConvexReactClient | null,
  action: BillingAction,
  amount: number,
  operation: () => Promise<T>
): Promise<{ success: true; result: T } | { success: false; error: UsageCheck }> {
  // Check limit first
  const check = await checkUsageBeforeAction(convex, action, amount);
  if (!check.allowed) {
    return { success: false, error: check };
  }

  // Perform the operation
  const result = await operation();

  // Record usage
  await recordUsageAfterAction(convex, action, amount);

  return { success: true, result };
}

/**
 * Parse duration string to minutes for transcription usage tracking.
 * Handles formats like "01:23:45", "1:23:45", "5045" (seconds)
 */
export function parseDurationToMinutes(duration: string | undefined): number {
  if (!duration) return 0;

  // If it's just a number, assume seconds
  if (/^\d+$/.test(duration)) {
    return Math.ceil(parseInt(duration, 10) / 60);
  }

  // Parse HH:MM:SS or MM:SS format
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) {
    // HH:MM:SS
    return Math.ceil(parts[0] * 60 + parts[1] + parts[2] / 60);
  } else if (parts.length === 2) {
    // MM:SS
    return Math.ceil(parts[0] + parts[1] / 60);
  }

  return 0;
}

/**
 * Format usage for display
 */
export function formatUsage(current: number, limit: number, unit: string = ""): string {
  if (limit === -1) {
    return `${current}${unit} (unlimited)`;
  }
  return `${current}${unit} / ${limit}${unit}`;
}

/**
 * Get percentage of limit used
 */
export function getUsagePercentage(current: number, limit: number): number {
  if (limit === -1) return 0;
  return Math.min((current / limit) * 100, 100);
}
