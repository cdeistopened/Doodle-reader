# Doodle Reader - Development TODO

*Last Updated: 2026-01-02*

## 🚨 Critical Security Fixes

### Production Configuration ❌
- [ ] Configure PageSnap production URL (`lib/pagesnap.ts:7`) - currently hardcoded to localhost
- [ ] Add Stripe webhook signature verification (`convex/http.ts:26`) - security vulnerability
- [ ] Remove Tailwind CDN from production (`index.html`) - use PostCSS build instead

### API Key Security ❌
- [ ] Move API keys from client to Convex Actions (server-side)
- [ ] Remove `VITE_GEMINI_API_KEY` and `VITE_ASSEMBLYAI_API_KEY` from client bundle
- [ ] Gate AI features behind Clerk authentication
- [ ] Store API keys as Convex env vars only

---

## 💰 Billing Integration ⚠️ (Infrastructure Ready)

### Stripe Setup
- [ ] Create Stripe account/products (Pro Monthly $12, Pro Yearly $99)
- [ ] Set Convex env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`
- [ ] Add webhook endpoint: `https://<deployment>.convex.site/stripe-webhook`
- [ ] Complete webhook signature verification
- [ ] Test checkout flow with test card `4242 4242 4242 4242`

### UI Integration
- [x] Add `<PricingModal>` to app ✅
- [x] Add `<UsageSummary>` to sidebar ✅
- [x] Basic usage tracking infrastructure ✅
- [ ] Wire up usage checks before `onTranscribe` calls in FeedList
- [ ] Wire up usage checks before AI summary generation
- [ ] Wire up usage checks before PDF OCR scanning
- [x] Show `<UpgradePrompt>` when limits are reached ✅

### Code Locations for Integration
- `components/FeedList.tsx:84` - `handleTranscribe()` needs usage check
- `components/ScanModal.tsx` - PDF scanning needs usage check
- `lib/ai.ts` - Summary generation needs usage check

---

## 📋 Boards Feature ⚠️ (Partially Implemented)

### Status
- [x] Backend schema implemented ✅
- [x] Basic board creation/management ✅
- [x] BoardView component exists ✅
- [ ] Sharing/public boards not implemented
- [ ] Export functionality missing
- [ ] Keyboard shortcut (b) not wired up

### Still Needed
- [ ] Public board sharing with unique URLs
- [ ] Export to Obsidian (markdown + frontmatter)
- [ ] Export to Notion (API integration)
- [ ] Drag-and-drop reordering
- [ ] Board templates/presets

---

## 🔍 Core BACKLOG Features (From Google Reader Vision)

### Stream Architecture ❌
- [ ] Everything as a stream (feeds, folders, starred items)
- [ ] Unified stream interface
- [ ] Stream composition/filtering

### Annotation Layer ❌ (Critical)
- [ ] Notes as first-class metadata
- [ ] Annotations persist through exports
- [ ] Inline annotation UI
- [ ] Annotation search/filtering

### Send To Integrations ❌
- [ ] Universal pipes with variable templates
- [ ] Obsidian integration with customizable templates
- [ ] Notion database sync
- [ ] Make.com/Zapier webhooks
- [ ] Email digest option

### Keyboard Flow State ⚠️
- [x] Basic J/K navigation ✅
- [ ] Full Google Reader shortcuts (m, s, v, shift+a, etc.)
- [ ] Shortcuts help modal (?)
- [ ] Vi-mode navigation
- [ ] Optimistic UI updates for all actions

### Typography & Reading Experience ⚠️
- [x] Beautiful typography classes exist ✅
- [ ] Create `.prose-transcript` variant for transcripts
- [ ] Reading time estimates
- [ ] Font size/theme preferences
- [ ] Distraction-free reading mode

---

## 🎙️ Podcast & Transcription Improvements

### Podcast Discovery ⚠️
- [x] iTunes Search API ✅
- [x] Better error messages ✅
- [x] Duration parsing normalized ✅
- [ ] Add Podcast Index API as fallback (TODO in `lib/itunes.ts:32`)

### Transcript Quality
- [ ] AI post-processing for readability (remove filler words, add punctuation)
- [ ] Speaker diarization for interviews
- [ ] Timestamp preservation for quotes
- [ ] Export with timestamps for video editors

---

## 📄 PDF OCR Improvements (Bug Fix Needed)

### Large PDF Processing ❌
- [ ] Fix chunk processing for large PDFs (currently failing on 248-page PDFs)
- [ ] Implement retry logic for failed chunks
- [ ] Add concatenation feature for processing in sections:
  - Process in 20-page chunks
  - Store partial results
  - Concatenate all successful chunks
  - Show progress per chunk (not just "Chunk 1/13 failed")
- [ ] Better error handling when Gemini returns no content
- [ ] Consider reducing chunk size from 20 to 6-10 pages for reliability
- [ ] Add option to resume failed OCR jobs

### Current Issue
- Large PDFs (248 pages) fail with "No content returned from Gemini"
- Processing stops after first failed chunk instead of continuing
- No way to recover partial results

---

## 🚀 Performance & Polish

### Search & Discovery
- [ ] Full-text search across all content
- [ ] Search filters (by feed, date range, starred)
- [ ] Search suggestions/autocomplete
- [ ] Recent searches

### Import/Export
- [ ] OPML import/export for feed migration
- [ ] Bulk export to Obsidian vault
- [ ] Scheduled exports (daily/weekly)
- [ ] Export templates customization

### UI/UX Polish
- [ ] Dark mode toggle
- [ ] PWA/offline support with Service Worker
- [ ] Loading skeletons for better perceived performance
- [ ] Undo/redo for destructive actions
- [ ] Batch operations (mark multiple as read)

### Developer Experience
- [ ] Feed context prompt UI (contextPrompt field exists, needs UI)
- [ ] Keyboard shortcuts help modal (?)
- [ ] API documentation for integrations
- [ ] Webhook endpoints for automation

---

## 🌟 Community & Social Features

### Sharing & Discovery
- [ ] Public feed recommendations
- [ ] Follow other users' public boards
- [ ] Share transcription costs (community pool)
- [ ] Trending articles within network

### Collaboration
- [ ] Shared boards with team members
- [ ] Comments on board items
- [ ] Board activity feed
- [ ] Export permissions management

---

## 📝 Notes

- Security fixes should be prioritized before any public launch
- Billing infrastructure is mostly ready, just needs Stripe account setup
- Boards feature has good foundation but needs sharing/export to be useful
- Core Google Reader features (streams, annotations, send-to) are the main differentiation
- Consider implementing annotation layer before send-to integrations (they depend on it)
