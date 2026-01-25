# NOW - Doodle Reader

*Updated: 2026-01-25*

---

## ⚠️ CRITICAL: Build Fiasco - Railway Broken

**Status:** Railway builds are failing. DO NOT make more commits until resolved.

**Root Cause:** Two sessions committed simultaneously:
- Session A added PageSnap (Python) as a subfolder
- Session B added Newsletter feature (Node.js)
- Nixpacks tries to build BOTH, fails on `pip: command not found`

**Recovery docs:** `.claude/recovery/FIASCO-2026-01-25.md`

### Fix Options (pick one)

1. **Move pagesnap to separate repo** (cleanest) - it's a separate Railway service anyway
2. **Add Dockerfile** that explicitly builds only Node.js
3. **Railway dashboard** - configure build settings to ignore pagesnap

### Last Working Commit
```
0f0173d Fix transform output stacking + simplify transcription limits
```

### Nuclear Rollback (if needed)
```bash
git reset --hard 0f0173d
git push --force origin main
```

---

## Pending: Newsletter-to-RSS Feature

**Status:** Code complete, not deployed (blocked by build fiasco)

Uses [Kill the Newsletter](https://kill-the-newsletter.com) to convert email newsletters to RSS feeds.

### Files Added/Modified
- `convex/newsletters.ts` - Backend (createNewsletterFeed action, queries, mutations)
- `convex/schema.ts` - Added `newsletterFeeds` table
- `components/AddNewsletterModal.tsx` - UI modal
- `App.tsx` - Wired up modal state
- `components/Sidebar.tsx` - "Add Newsletter" button
- `FEATURE-newsletter-to-rss.md` - Full spec

### Patches Saved
```bash
# To reapply after recovery:
git am .claude/recovery/*.patch
```

---

## PageSnap / Doodle Scanner

Building OCR service at `scanner.doodlereader.com`:

1. **Camera Scan** - Motion-detected page capture for physical books
2. **PDF Upload** - Direct PDF processing with intelligent chunking

### Done
- [x] Unified web app (`pagesnap/web_app.py`)
- [x] PDF pipeline with chunked OCR
- [x] Convex schema - `scanJobs` table

### Blocked
- [ ] Deploy to Railway - blocked by build fiasco
- [ ] Connect to Convex

### Architecture Note
PageSnap lives in `pagesnap/` subfolder but is deployed as **separate Railway service**. This is the source of the build conflict - Nixpacks detects Python and tries to build it with the main Node.js app.

---

## Other Work

| Priority | Task | Status |
|----------|------|--------|
| **HIGH** | Fix Railway build | BLOCKED |
| Medium | Newsletter feature | Code complete, needs deploy |
| Medium | Fix YouTube transcripts | Reliability issues |
| Low | Stream Architecture epic | `doodle-reader-btb` |

---

## Key Gotchas

1. **Gemini model**: Use `gemini-3-flash-preview`
2. **PageSnap env**: `GEMINI_API_KEY` in `.env` (non-VITE for server-side)
3. **Build conflict**: pagesnap/ causes Nixpacks to detect Python

---

*Update at session end via /handoff*
