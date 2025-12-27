# Doodle Reader - Development TODO

## Billing Integration (Ready to Wire Up)

When you have laptop access:

### Stripe Setup
- [ ] Create Stripe account/products (Pro Monthly $12, Pro Yearly $99)
- [ ] Set Convex env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`
- [ ] Add webhook endpoint: `https://<deployment>.convex.site/stripe-webhook`
- [ ] Test checkout flow with test card `4242 4242 4242 4242`

### UI Integration
- [ ] Add `<PricingModal>` to app (accessible from settings or sidebar)
- [ ] Add `<UsageSummary>` to sidebar for logged-in users
- [ ] Wire up usage checks before `onTranscribe` calls in FeedList
- [ ] Wire up usage checks before AI summary generation
- [ ] Wire up usage checks before PDF OCR scanning
- [ ] Show `<UpgradePrompt>` when limits are reached

### Code Locations for Integration
- `components/FeedList.tsx:84` - `handleTranscribe()` needs usage check
- `components/ScanModal.tsx` - PDF scanning needs usage check
- `lib/ai.ts` - Summary generation needs usage check
- `components/Sidebar.tsx` - Add UsageSummary component
- `App.tsx` - Add PricingModal state and component

---

## Podcast Feed Issues

### Known Problems
- [ ] Feedly search returns wrong feeds for podcasts with common names
- [ ] No podcast-specific directory (iTunes, Podcast Index)
- [ ] Some hosts (Megaphone, Omny, Acast) block CORS proxies
- [ ] Duration parsing inconsistent ("01:23:45" vs "5045" seconds)

### Planned Fixes
- [ ] Add iTunes Search API for podcast discovery
- [ ] Add Podcast Index API as fallback
- [ ] Better error messages when feeds fail to load
- [ ] Normalize duration parsing in RSS parser

---

## API Key Security (Phase 1 - Future)

### Problem
`VITE_*` env vars are exposed in client bundle. Anyone can extract Gemini/AssemblyAI keys.

### Solution
- [ ] Move AI calls to Convex Actions (server-side)
- [ ] Store API keys as Convex env vars (not VITE_*)
- [ ] Gate AI features behind Clerk authentication
- [ ] Remove VITE_GEMINI_API_KEY and VITE_ASSEMBLYAI_API_KEY from client

---

## Future Features (Backlog)

- [ ] OPML import/export for feed migration
- [ ] Dark mode toggle
- [ ] Full-text search across all content
- [ ] Feed context prompt UI (contextPrompt field exists, needs UI)
- [ ] Keyboard shortcuts help modal
- [ ] PWA/offline support
