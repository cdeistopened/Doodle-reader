# Stripe Setup Checklist for Doodle Reader

## ✅ What's Already Built
- [x] Stripe webhook handler with signature verification
- [x] Database schema for subscriptions and usage
- [x] Billing React hook (`useBilling`)
- [x] PricingModal component
- [x] UpgradePrompt component
- [x] UsageSummary in sidebar
- [x] Usage tracking functions

## 📋 What You Need to Do

### 1. Create Stripe Account & Products
- [ ] Go to [Stripe Dashboard](https://dashboard.stripe.com)
- [ ] Create a product called "Doodle Reader Pro"
- [ ] Add two prices:
  - Monthly: $12/month (name: "Pro Monthly")
  - Yearly: $99/year (name: "Pro Yearly")
- [ ] Copy the Price IDs (they look like `price_1ABC...`)

### 2. Set Environment Variables

#### Local Development (.env.local)
```bash
# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
VITE_STRIPE_PRICE_PRO_MONTHLY=price_YOUR_MONTHLY_PRICE_ID
VITE_STRIPE_PRICE_PRO_YEARLY=price_YOUR_YEARLY_PRICE_ID
```

#### Convex Environment Variables
Run these commands:
```bash
npx convex env set STRIPE_SECRET_KEY "sk_test_YOUR_SECRET_KEY"
npx convex env set STRIPE_WEBHOOK_SECRET "whsec_YOUR_WEBHOOK_SECRET"
npx convex env set STRIPE_PRICE_PRO_MONTHLY "price_YOUR_MONTHLY_PRICE_ID"
npx convex env set STRIPE_PRICE_PRO_YEARLY "price_YOUR_YEARLY_PRICE_ID"
```

### 3. Configure Stripe Webhook
- [ ] In Stripe Dashboard, go to Developers → Webhooks
- [ ] Add endpoint: `https://YOUR_CONVEX_URL/stripe-webhook`
- [ ] Select events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- [ ] Copy the webhook signing secret

### 4. Test the Integration
- [ ] Run the app locally: `npm run dev`
- [ ] Click on your avatar → should show usage summary
- [ ] Click "Upgrade" → should open pricing modal
- [ ] Complete a test purchase with card `4242 4242 4242 4242`
- [ ] Verify subscription is active in Convex dashboard
- [ ] Test transcription to verify usage tracking

### 5. Deploy to Production
- [ ] Set all environment variables in your hosting platform
- [ ] Update webhook URL in Stripe to production URL
- [ ] Test with a real card in production

## 🎯 Quick Test

1. The UsageSummary should already be visible in the sidebar (bottom)
2. It should show your current usage and limits
3. There should be an "Upgrade" button when on free plan
4. Clicking it should open the pricing modal

## 🐛 Troubleshooting

### "Upgrade button not visible"
- Make sure you're logged in with Clerk
- Check browser console for errors
- Verify VITE_CLERK_PUBLISHABLE_KEY is set

### "Stripe checkout fails"
- Check that all Stripe environment variables are set
- Verify Price IDs match what's in your Stripe dashboard
- Check Convex logs for webhook errors

### "Usage not tracking"
- The usage tracking integration still needs to be added to:
  - Transcription operations in storage hooks
  - PDF OCR scanning
  - AI summary generation

## 📝 Notes
- The billing system tracks: transcription minutes, AI summaries, and PDF pages
- Free tier limits: 30 min transcription, 20 summaries, 50 PDF pages per month
- Pro tier: 500 min transcription, 1000 summaries, 2000 PDF pages per month
- Usage resets on the 1st of each month