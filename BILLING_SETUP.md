# Stripe Billing Setup Guide

This guide walks you through setting up Stripe billing for Doodle Reader.

## Prerequisites

- Stripe account (create at https://stripe.com)
- Access to your Convex dashboard
- Local development environment

## Step 1: Create Stripe Products

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/products)

2. Create a **Pro Monthly** product:
   - Name: "Doodle Reader Pro"
   - Description: "500 min transcription, unlimited AI features"
   - Price: $12.00 USD / month
   - **Copy the Price ID** (starts with `price_`)

3. Create a **Pro Yearly** product:
   - Name: "Doodle Reader Pro (Annual)"
   - Description: "Save 30% with annual billing"
   - Price: $99.00 USD / year
   - **Copy the Price ID**

## Step 2: Set Up Stripe Webhook

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)

2. Click "Add endpoint"

3. Enter your Convex HTTP endpoint:
   ```
   https://<your-convex-deployment>.convex.site/stripe-webhook
   ```
   (Find your deployment URL in Convex dashboard)

4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

5. Click "Add endpoint"

6. **Copy the Signing Secret** (starts with `whsec_`)

## Step 3: Configure Convex Environment Variables

Run these commands in your project directory:

```bash
# Stripe API Keys (from Dashboard > Developers > API Keys)
npx convex env set STRIPE_SECRET_KEY "sk_live_..."
# Use sk_test_... for testing

# Webhook signing secret (from Step 2)
npx convex env set STRIPE_WEBHOOK_SECRET "whsec_..."

# Price IDs (from Step 1)
npx convex env set STRIPE_PRICE_PRO_MONTHLY "price_..."
npx convex env set STRIPE_PRICE_PRO_YEARLY "price_..."
```

## Step 4: Add Frontend Environment Variables

Add to your `.env.local`:

```bash
# For the pricing modal to know which prices to use
VITE_STRIPE_PRICE_PRO_MONTHLY=price_...
VITE_STRIPE_PRICE_PRO_YEARLY=price_...
```

## Step 5: Deploy and Test

1. Deploy to Convex:
   ```bash
   npx convex deploy
   ```

2. Test the webhook:
   - Go to Stripe Dashboard > Developers > Webhooks
   - Click your endpoint
   - Click "Send test webhook"
   - Select `checkout.session.completed`
   - Verify it shows a 200 response

3. Test the checkout flow:
   - Sign in to your app
   - Click "Upgrade to Pro"
   - Use Stripe test card: `4242 4242 4242 4242`
   - Complete checkout
   - Verify subscription appears in database

## Step 6: Integrate Usage Tracking

Add usage tracking to your AI operations. Example for transcription:

```typescript
import { useBilling } from './lib/hooks/useBilling';

function TranscribeButton({ item }) {
  const { checkLimit, trackUsage } = useBilling();

  const handleTranscribe = async () => {
    const durationMinutes = parseDurationToMinutes(item.duration);

    // Check limit before expensive operation
    const check = checkLimit('transcribe', durationMinutes);
    if (!check.allowed) {
      // Show upgrade prompt
      return;
    }

    // Perform transcription
    const result = await transcribe(item.audioUrl);

    // Track usage after success
    await trackUsage('transcribe', durationMinutes);
  };
}
```

## Step 7: Add Usage Display (Optional)

Add the usage summary to your sidebar:

```tsx
import { UsageSummary } from './components/UpgradePrompt';
import { PricingModal } from './components/PricingModal';

function Sidebar() {
  const [showPricing, setShowPricing] = useState(false);

  return (
    <>
      <UsageSummary onUpgrade={() => setShowPricing(true)} />
      <PricingModal
        isOpen={showPricing}
        onClose={() => setShowPricing(false)}
      />
    </>
  );
}
```

## Plan Limits

Current configuration in `convex/stripe.ts`:

| Feature | Free | Pro | Team |
|---------|------|-----|------|
| Transcription | 30 min/mo | 500 min/mo | 2000 min/mo |
| AI Summaries | 10/mo | Unlimited | Unlimited |
| PDF Pages | 50/mo | Unlimited | Unlimited |

To modify limits, edit the `PLANS` object in `convex/stripe.ts`.

## Testing Checklist

- [ ] Products created in Stripe Dashboard
- [ ] Webhook endpoint added and verified
- [ ] Environment variables set in Convex
- [ ] Checkout flow works with test card
- [ ] Webhook creates subscription in database
- [ ] Usage tracking increments correctly
- [ ] Upgrade prompts show when limits reached
- [ ] Portal session works for managing subscription

## Troubleshooting

### Webhook returns 500
- Check Convex logs for error details
- Verify STRIPE_WEBHOOK_SECRET is correct
- Ensure all event types are handled

### Checkout doesn't redirect
- Check browser console for errors
- Verify STRIPE_SECRET_KEY is set
- Ensure user is authenticated

### Subscription not created after checkout
- Check webhook logs in Stripe Dashboard
- Verify `client_reference_id` contains userId
- Check Convex function logs

## Production Checklist

Before going live:

1. Switch from test keys (`sk_test_`) to live keys (`sk_live_`)
2. Update webhook endpoint to production URL
3. Update signing secret for production webhook
4. Test with a real card (can refund immediately)
5. Set up Stripe tax collection if needed
6. Configure customer portal branding

## Files Created

```
convex/
├── schema.ts        # Added subscriptions & usage tables
├── stripe.ts        # Stripe actions & queries
└── http.ts          # Webhook HTTP endpoint

lib/
├── billing.ts       # Billing utilities
└── hooks/
    └── useBilling.ts  # React hook for billing

components/
├── PricingModal.tsx    # Subscription pricing UI
└── UpgradePrompt.tsx   # Limit reached prompts
```
