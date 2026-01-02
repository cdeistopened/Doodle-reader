# Doodle Reader TODO List

## 🔥 Critical Security Issues

### API Key Exposure
- [ ] **CRITICAL**: Production PageSnap URL not configured (hardcoded to localhost)
  - Location: `components/Sidebar.tsx:165`
  - Currently: `'/pagesnap'; // TODO: Configure production URL`
  - Risk: Feature won't work in production

- [ ] **CRITICAL**: Missing Stripe webhook signature verification
  - Location: `convex/http.ts:38`
  - Currently: `// TODO: Implement proper signature verification`
  - Risk: Webhook endpoints vulnerable to spoofing

## 🚧 Incomplete Features

### Podcast Discovery
- [ ] Add Podcast Index support with user-provided API keys
  - Location: `lib/feedDiscovery.ts:83`
  - Currently only uses iTunes Search API
  - Would expand podcast discovery options

### Billing & Subscription System
- [x] Basic billing infrastructure implemented
  - Usage tracking (transcribe, summarize, scan)
  - Stripe integration scaffolding
  - Usage limits and checks
- [ ] Complete Stripe webhook handling with signature verification
- [ ] Add subscription management UI
- [ ] Implement plan upgrade/downgrade flows
- [ ] Add usage visualization in sidebar

### Boards Feature
- [x] Basic boards implementation exists
  - BoardsPanel, BoardView, SaveToBoardModal components
  - Convex backend with CRUD operations
- [ ] Polish board management UI
- [ ] Add board sharing capabilities
- [ ] Implement board templates
- [ ] Add bulk operations for board items

## 🎨 UI/UX Improvements (from BACKLOG.md)

### High Priority: Stream Architecture
- [ ] Unified stream abstraction for feeds, folders, starred, shared, transcribed
- [ ] Stream → Markdown export (single item, batch, or continuous)
- [ ] Stream continuation tokens for pagination/batch AI processing
- [ ] Stream composition: combine multiple streams into custom views

### Annotation Layer
- [ ] Notes as first-class metadata on any item
- [ ] Quick-note keyboard shortcut (N or Shift+D)
- [ ] Note types: highlight, comment, question, action-item
- [ ] Notes exportable as markdown frontmatter

### Send To: Universal Pipes
- [ ] Custom "Send To" with variable templates
- [ ] Built-in targets: Obsidian, Notion, Readwise, local markdown file
- [ ] AI targets: "Send to Summarizer", "Send to Translator", "Send to Q&A Generator"
- [ ] Webhook support for custom workflows
- [ ] Batch send: pipe entire stream to target

### Keyboard Flow State
- [ ] J/K with optimistic mark-as-read
- [ ] S for star (instant yellow feedback)
- [ ] N for quick note modal
- [ ] T for tag picker
- [ ] P for "process with AI" (opens AI action menu)
- [ ] Shift+A mark all read with undo toast
- [ ] A for AI summary overlay (non-destructive)
- [ ] Q for "queue for AI batch processing"
- [ ] E for "extract entities/facts"

### Typography & Density
- [ ] Implement `.prose-transcript` class for better transcript readability
- [ ] Add "Compact Density" mode toggle for Google Reader style
- [ ] Audit current colors against semantic meaning:
  - Star icon should be gold (#FFC000)
  - Ensure unread/read contrast is strong enough
  - Check link colors are distinct from body text

### Transcript Improvements
- [ ] AI post-processing for structure (paragraph breaks, section headers)
- [ ] Speaker identification and labeling
- [ ] Timestamp markers in functional margins
- [ ] Key quote extraction and highlighting
- [ ] Progressive disclosure: summary → key quotes → full transcript
- [ ] Community transcription model (shared across users)

## 🔧 Technical Debt

### Performance & Architecture
- [ ] Implement negative sync strategy (sync read IDs, not unread IDs)
- [ ] Add Service Worker for true offline support
- [ ] Queue actions when offline, replay on reconnect
- [ ] Optimize stream loading with continuation tokens

### Code Organization
- [ ] Extract common patterns into reusable hooks
- [ ] Standardize error handling across API calls
- [ ] Add proper TypeScript types for all API responses
- [ ] Implement proper loading states for all async operations

## ✨ Quick Wins

### AI Integration
- [x] Summarize button per item (basic implementation exists)
- [ ] Export starred as markdown file
- [ ] Batch export folder as markdown
- [ ] AI-generated tags on ingest
- [ ] "Similar items" based on embeddings
- [ ] Auto-extract key quotes/facts

### Analytics & Insights
- [ ] Reading velocity by feed/folder
- [ ] Star rate: % of items you star per feed
- [ ] Time-to-read estimates
- [ ] AI insight: "You read 80% of Stratechery but only 10% of TechCrunch"

### Social Features
- [ ] Personal "Shared" feed with public URL
- [ ] Follow other users' shared feeds within app
- [ ] "Friends' Shared Items" aggregated view
- [ ] Select text in transcript → Share audio clip

## 📱 Mobile Optimization
- [ ] Improve mobile sidebar behavior
- [ ] Optimize touch targets for mobile
- [ ] Add swipe gestures for navigation
- [ ] Mobile-optimized transcript view

## 🔐 Security & Privacy
- [ ] Implement proper API key encryption in localStorage
- [ ] Add domain restrictions for API keys
- [ ] Implement rate limiting for AI operations
- [ ] Add audit logging for sensitive operations

## 📚 Documentation
- [ ] API documentation for Send To webhooks
- [ ] Keyboard shortcut reference card
- [ ] User guide for AI features
- [ ] Developer setup guide

## 🎯 North Star Vision

The ideal flow:
1. Subscribe to feeds (RSS, podcasts, newsletters) ✅
2. Triage with J/K (keyboard flow state) ⚠️ (partial)
3. Star items worth processing ✅
4. Add notes for context ❌
5. Batch export starred → Markdown → Obsidian/AI workflow ❌
6. Share curated streams publicly ❌
7. Your reading becomes your knowledge graph ⚠️ (partial)

---

## Priority Order

1. **Security fixes** (API key exposure, webhook verification)
2. **Complete keyboard navigation** (core to Google Reader experience)
3. **Annotation layer** (notes as first-class citizens)
4. **Send To integrations** (Obsidian, Notion, Readwise)
5. **Transcript improvements** (AI polish, speaker labels)
6. **Stream architecture** (unified abstraction)
7. **Social features** (sharing, following)

---

*Last updated: 2026-01-02*