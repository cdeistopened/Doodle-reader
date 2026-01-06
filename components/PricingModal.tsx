/**
 * Pricing Modal
 *
 * Displays subscription plans and handles checkout.
 */

import React from "react";
import { X, Check, Zap, Sparkles } from "lucide-react";
import { useBilling } from "../lib/hooks/useBilling";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRICE_IDS = {
  proMonthly: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY || null,
  proYearly: import.meta.env.VITE_STRIPE_PRICE_PRO_YEARLY || null,
};

const STRIPE_NOT_CONFIGURED = !PRICE_IDS.proMonthly;

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For casual readers",
    features: [
      "150 minutes transcription/month",
      "10 AI summaries/month",
      "50 PDF pages/month",
      "Unlimited RSS feeds",
      "Local storage",
    ],
    cta: "Current Plan",
    priceId: null,
    popular: false,
  },
  {
    name: "Pro",
    price: "$12",
    period: "/month",
    yearlyPrice: "$99/year",
    description: "For power users",
    features: [
      "500 minutes transcription/month",
      "Unlimited AI summaries",
      "Unlimited PDF scanning",
      "Cloud sync across devices",
      "Priority processing",
      "Email support",
    ],
    cta: "Upgrade to Pro",
    priceId: PRICE_IDS.proMonthly,
    yearlyPriceId: PRICE_IDS.proYearly,
    popular: true,
  },
];

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const { subscription, checkout, isLoading } = useBilling();
  const [billingPeriod, setBillingPeriod] = React.useState<"monthly" | "yearly">("monthly");
  const [isCheckingOut, setIsCheckingOut] = React.useState(false);

  if (!isOpen) return null;

  const handleCheckout = async (priceId: string | null) => {
    if (!priceId) {
      alert("Payments are not yet configured. Please contact support.");
      return;
    }
    setIsCheckingOut(true);
    try {
      await checkout(priceId);
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout. Please try again or contact support.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-cream rounded-xl shadow-brutal max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <div>
            <h2 className="text-2xl font-serif font-bold text-ink">
              Choose Your Plan
            </h2>
            <p className="text-stone-600 mt-1">
              Unlock the full power of Doodle Reader
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center pt-6">
          <div className="bg-stone-100 p-1 rounded-lg flex gap-1">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === "monthly"
                  ? "bg-white shadow text-ink"
                  : "text-stone-600 hover:text-ink"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === "yearly"
                  ? "bg-white shadow text-ink"
                  : "text-stone-600 hover:text-ink"
              }`}
            >
              Yearly
              <span className="ml-1 text-xs text-teal-600 font-semibold">
                Save 30%
              </span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="p-6 grid md:grid-cols-2 gap-6">
          {plans.map((plan) => {
            const isCurrentPlan = subscription?.plan === plan.name.toLowerCase();
            const priceId =
              billingPeriod === "yearly" && plan.yearlyPriceId
                ? plan.yearlyPriceId
                : plan.priceId;

            return (
              <div
                key={plan.name}
                className={`relative rounded-xl border-2 p-6 ${
                  plan.popular
                    ? "border-teal-500 bg-gradient-to-b from-teal-50 to-cream"
                    : "border-stone-200 bg-white"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-teal-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <Sparkles size={12} />
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-ink">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-4xl font-bold text-ink">
                      {billingPeriod === "yearly" && plan.yearlyPrice
                        ? "$99"
                        : plan.price}
                    </span>
                    <span className="text-stone-500">
                      {billingPeriod === "yearly" && plan.yearlyPrice
                        ? "/year"
                        : plan.period}
                    </span>
                  </div>
                  <p className="text-stone-600 mt-2">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check
                        size={18}
                        className={`mt-0.5 ${
                          plan.popular ? "text-teal-500" : "text-stone-400"
                        }`}
                      />
                      <span className="text-sm text-stone-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleCheckout(priceId)}
                  disabled={isCurrentPlan || isCheckingOut || !priceId}
                  className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    isCurrentPlan
                      ? "bg-stone-100 text-stone-500 cursor-default"
                      : plan.popular
                      ? "bg-teal-500 hover:bg-teal-600 text-white"
                      : "bg-stone-900 hover:bg-stone-800 text-white"
                  } disabled:opacity-50`}
                >
                  {isCheckingOut ? (
                    <span className="animate-pulse">Processing...</span>
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : (
                    <>
                      <Zap size={16} />
                      {plan.cta}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 text-center text-sm text-stone-500">
          <p>
            Secure payment via Stripe. Cancel anytime.{" "}
            <a href="#" className="text-teal-600 hover:underline">
              Terms apply
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
