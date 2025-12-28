/**
 * Upgrade Prompt
 *
 * Shows when users hit their usage limits.
 * Can be used inline or as a modal blocker.
 */

import React from "react";
import { Zap, TrendingUp, Clock, FileText, Sparkles } from "lucide-react";
import { useBilling, UsageLimitCheck } from "../lib/hooks/useBilling";

interface UpgradePromptProps {
  limitCheck: UsageLimitCheck;
  action: "transcribe" | "summarize" | "scan";
  onUpgrade: () => void;
  variant?: "inline" | "modal" | "banner";
}

const actionLabels = {
  transcribe: {
    icon: Clock,
    title: "Transcription Limit Reached",
    description: "Upgrade to Pro for 500 minutes of transcription per month",
  },
  summarize: {
    icon: Sparkles,
    title: "Summary Limit Reached",
    description: "Upgrade to Pro for unlimited AI summaries",
  },
  scan: {
    icon: FileText,
    title: "PDF Scan Limit Reached",
    description: "Upgrade to Pro for unlimited PDF scanning",
  },
};

export function UpgradePrompt({
  limitCheck,
  action,
  onUpgrade,
  variant = "inline",
}: UpgradePromptProps) {
  const config = actionLabels[action];
  const Icon = config.icon;

  if (limitCheck.allowed) return null;

  if (variant === "banner") {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <Icon size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="font-medium text-amber-900">{config.title}</p>
            <p className="text-sm text-amber-700">{limitCheck.reason}</p>
          </div>
        </div>
        <button
          onClick={onUpgrade}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium flex items-center gap-2 whitespace-nowrap transition-colors"
        >
          <Zap size={16} />
          Upgrade
        </button>
      </div>
    );
  }

  if (variant === "modal") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-100 to-teal-200 rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon size={32} className="text-teal-600" />
          </div>

          <h2 className="text-2xl font-bold text-ink mb-2">{config.title}</h2>
          <p className="text-stone-600 mb-6">{limitCheck.reason}</p>

          <div className="bg-stone-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-stone-500 mb-2">With Pro you get:</p>
            <ul className="text-left space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <TrendingUp size={16} className="text-teal-500" />
                <span>500 minutes of transcription</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <Sparkles size={16} className="text-teal-500" />
                <span>Unlimited AI summaries</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <FileText size={16} className="text-teal-500" />
                <span>Unlimited PDF scanning</span>
              </li>
            </ul>
          </div>

          <button
            onClick={onUpgrade}
            className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Zap size={18} />
            Upgrade to Pro - $12/month
          </button>

          <p className="text-xs text-stone-400 mt-4">
            Cancel anytime. Secure payment via Stripe.
          </p>
        </div>
      </div>
    );
  }

  // Default: inline variant
  return (
    <div className="bg-gradient-to-r from-stone-50 to-stone-100 border border-stone-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-stone-200 rounded-lg shrink-0">
          <Icon size={18} className="text-stone-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-900">{config.title}</p>
          <p className="text-sm text-stone-600 mt-0.5">{limitCheck.reason}</p>
          <button
            onClick={onUpgrade}
            className="mt-3 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Zap size={14} />
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Usage Bar Component
 *
 * Shows current usage vs limit with a progress bar
 */
interface UsageBarProps {
  label: string;
  current: number;
  limit: number;
  unit?: string;
}

export function UsageBar({ label, current, limit, unit = "" }: UsageBarProps) {
  const percentage = limit === -1 ? 0 : Math.min((current / limit) * 100, 100);
  const isUnlimited = limit === -1;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-stone-600">{label}</span>
        <span className={`font-medium ${isAtLimit ? "text-red-600" : "text-stone-900"}`}>
          {isUnlimited ? (
            <span className="text-teal-600">Unlimited</span>
          ) : (
            `${current}${unit} / ${limit}${unit}`
          )}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isAtLimit
                ? "bg-red-500"
                : isNearLimit
                ? "bg-amber-500"
                : "bg-teal-500"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Usage Summary Panel
 *
 * Shows all usage metrics in a compact panel
 */
export function UsageSummary({ onUpgrade }: { onUpgrade: () => void }) {
  const { subscription, usage, isPro, isLoading } = useBilling();

  if (isLoading) {
    return (
      <div className="p-4 bg-stone-50 rounded-lg animate-pulse">
        <div className="h-4 bg-stone-200 rounded w-24 mb-4" />
        <div className="space-y-3">
          <div className="h-2 bg-stone-200 rounded" />
          <div className="h-2 bg-stone-200 rounded" />
          <div className="h-2 bg-stone-200 rounded" />
        </div>
      </div>
    );
  }

  if (!subscription || !usage) return null;

  const limits = subscription.limits;

  return (
    <div className="p-4 bg-stone-50 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-stone-900">
          {subscription.plan === "free" ? "Free Plan" : "Pro Plan"}
        </h3>
        {!isPro && (
          <button
            onClick={onUpgrade}
            className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full font-medium hover:bg-teal-200 transition-colors"
          >
            Upgrade
          </button>
        )}
      </div>

      <div className="space-y-3">
        <UsageBar
          label="Transcription"
          current={Math.round(usage.transcriptionMinutes)}
          limit={limits.transcriptionMinutes}
          unit=" min"
        />
        <UsageBar
          label="AI Summaries"
          current={usage.summariesGenerated}
          limit={limits.summariesPerMonth}
        />
        <UsageBar
          label="PDF Pages"
          current={usage.pdfPagesScanned}
          limit={limits.pdfPages}
        />
      </div>

      {'currentPeriodEnd' in subscription && subscription.currentPeriodEnd && (
        <p className="text-xs text-stone-500">
          Resets {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
