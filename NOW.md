# NOW - Doodle Reader

*Updated: 2026-01-21*

---

## Current Focus: Doodle Scanner

Building a unified OCR service at `scanner.doodlereader.com` with two input modes:

1. **Camera Scan** - Motion-detected page capture for physical books
2. **PDF Upload** - Direct PDF processing with intelligent chunking

### Done

- [x] Unified web app (`pagesnap/web_app.py`) with landing page
- [x] Simplified camera UX - single button state machine
- [x] PDF pipeline with chunked OCR and progress tracking
- [x] Convex schema - `scanJobs` table added
- [x] API key loading fixed (overrides stale shell env vars)

### Remaining (Ship Checklist)

- [ ] **Connect to Convex** - Wire `convex/scanJobs.ts` so jobs sync to Doodle Reader
- [ ] **Deploy to Railway** - Set `scanner.doodlereader.com` subdomain
- [ ] **Production test** - Verify OCR with Railway env vars

### Architecture

```
pagesnap/
├── web_app.py        # Flask: landing, upload, camera routes
├── pdf_pipeline.py   # PDF → images → Gemini OCR → markdown
├── ocr_gemini.py     # Image OCR for camera captures
├── sessions/         # Camera sessions (auto-created)
├── uploads/          # PDF uploads (auto-created)
└── output/           # OCR results (auto-created)
```

### Key Gotchas

1. **Gemini model**: Use `gemini-3-flash-preview` (Claude predates Gemini 3)
2. **Env loading**: Direct `os.environ[key] = value` not `setdefault()` to override shell vars
3. **API key**: `GEMINI_API_KEY` in `doodle-reader/.env` (non-VITE for server-side)

### Local Dev

```bash
cd pagesnap && python3 web_app.py
# Open http://localhost:5001
```

---

## Other Work

| Priority | Task | Status |
|----------|------|--------|
| Medium | Fix YouTube transcripts | Reliability issues |
| Low | Stream Architecture epic | `doodle-reader-btb` |
| Low | Annotation Layer epic | `doodle-reader-c93` |

---

## Backlog

See root `backlog.md` filtered by `project: doodle-reader`

---

*Update at session end via /handoff*
