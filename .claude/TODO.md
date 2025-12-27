# Doodle Reader - Development TODO

## Billing Integration (Ready to Wire Up)

When you have laptop access:

### Stripe Setup
- [ ] Create Stripe account/products (Pro Monthly $12, Pro Yearly $99)
- [ ] Set Convex env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`
- [ ] Add webhook endpoint: `https://<deployment>.convex.site/stripe-webhook`
- [ ] Test checkout flow with test card `4242 4242 4242 4242`

### UI Integration (DONE)
- [x] Add `<PricingModal>` to app (accessible from settings or sidebar)
- [x] Add `<UsageSummary>` to sidebar for logged-in users
- [ ] Wire up usage checks before `onTranscribe` calls in FeedList
- [ ] Wire up usage checks before AI summary generation
- [ ] Wire up usage checks before PDF OCR scanning
- [ ] Show `<UpgradePrompt>` when limits are reached

### Code Locations for Integration
- `components/FeedList.tsx:84` - `handleTranscribe()` needs usage check
- `components/ScanModal.tsx` - PDF scanning needs usage check
- `lib/ai.ts` - Summary generation needs usage check

---

## Podcast Feed Issues (FIXED)

- [x] Add iTunes Search API for podcast discovery
- [x] Better error messages when feeds fail to load
- [x] Normalize duration parsing in RSS parser
- [ ] Add Podcast Index API as fallback (optional, iTunes is usually enough)

---

## Boards Feature (Like Feedly, but Better)

Design notes for boards/collections system:

### Concept
- **Folders** = organize feeds by topic (existing)
- **Boards** = curated collections of saved articles/transcripts (new)

### Key Differences from Folders
- Boards contain individual items, not feeds
- Same item can be in multiple boards
- Boards are shareable/exportable
- Designed for Notion/Obsidian sync

### Schema Addition
```typescript
boards: defineTable({
  userId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  icon: v.optional(v.string()),  // emoji or lucide icon
  color: v.optional(v.string()),
  isPublic: v.boolean(),         // for sharing
  sortOrder: v.number(),
})

boardItems: defineTable({
  userId: v.string(),
  boardId: v.string(),
  documentId: v.string(),        // reference to documents table
  addedAt: v.string(),
  note: v.optional(v.string()),  // user annotation
})
```

### Export Formats (for Notion/Obsidian)
- Markdown files with frontmatter (YAML metadata)
- JSON for API integrations
- Obsidian vault structure (folders + wikilinks)
- Notion database CSV

### UI Considerations
- "Save to Board" button on items (like Feedly)
- Board view shows collected items
- Drag-and-drop reordering
- Quick add via keyboard shortcut (b?)

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
- [ ] Boards feature (see design above)
- [ ] Notion/Obsidian export
