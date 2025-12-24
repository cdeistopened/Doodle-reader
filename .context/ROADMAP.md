# Doodle Reader Roadmap

> "Google Reader reimagined for the age of AI agents"

## Vision

A unified content-to-markdown app with **mini-apps** (utilities) for each content type. Each mini-app has its own workflow UI but shares a common content database and export system.

**Core principles:**
1. Each content source = a mini-app with dedicated workflow
2. All output = clean markdown with consistent frontmatter
3. Agentic features enhance but don't block manual workflows
4. Export to files or integrate with Obsidian/Notion/etc.

---

## Architecture Overview

```
doodle-reader/
├── lib/                    # Shared utilities (EXISTING)
│   ├── rss.ts             # RSS fetching, Feedly search
│   ├── transcribe.ts      # AssemblyAI integration
│   ├── polish.ts          # Gemini transcript cleanup
│   ├── youtube.ts         # YouTube transcript extraction
│   ├── ocr.ts             # PDF OCR (basic)
│   ├── ai.ts              # Gemini client
│   └── storage/           # IndexedDB + markdown export
│
├── projects/amanuensis/   # Advanced OCR pipeline (TO INTEGRATE)
│   ├── analyzer.py        # PDF structure analysis
│   ├── planner.py         # Chunking strategy
│   ├── ocr.py             # Gemini Vision OCR
│   ├── orchestrator.py    # Pipeline coordinator
│   └── validator.py       # Quality checks
│
└── page snap/pagesnap/    # Camera OCR utility (SEPARATE)
    └── ocr_gemini.py      # Real-time camera → markdown
```

---

## Mini-Apps (Workflows)

### 1. Podcast Transcriber
**Status**: Core utilities exist in `lib/transcribe.ts` + `lib/polish.ts`

**Workflow:**
1. Input RSS feed URL (or search via Feedly)
2. Select episode(s) from feed
3. Transcribe via AssemblyAI ($0.15/hr)
4. Polish with Gemini (speaker labels, cleanup)
5. Output: Clean markdown with chapters, speakers

**Existing code:**
- `transcribe.ts`: AssemblyAI integration, progress tracking, cost estimation
- `polish.ts`: Gemini prompts for transcript cleanup, show-specific context
- `rss.ts`: Feed parsing, episode extraction, CORS proxy handling

**TODO:**
- [ ] Mini-app UI (feed input → episode picker → transcribe → polish)
- [ ] Batch processing multiple episodes
- [ ] Save show context for reuse

---

### 2. PDF OCR (Amanuensis)
**Status**: Full pipeline exists in `projects/amanuensis/`, needs integration

**Workflow:**
1. Upload PDF
2. Analyze structure (page count, complexity, document type)
3. Generate chunking plan
4. OCR each chunk via Gemini Vision
5. Stitch chunks, fix boundaries
6. Post-process (hyphenation, headers/footers)
7. Output: Clean markdown

**Existing code (amanuensis/):**
- `analyzer.py`: PDF structure analysis, complexity scoring
- `planner.py` / `planner_v2.py` / `ai_planner.py`: Chunking strategies
- `ocr.py`: Gemini Vision OCR calls
- `orchestrator.py`: Pipeline coordination
- `validator.py`: Quality checks
- `rough_ocr.py`: Quick-and-dirty OCR for previews

**TODO:**
- [ ] Expose as API endpoint or integrate into main app
- [ ] Mini-app UI (upload → analyze → configure → process → review)
- [ ] Progress tracking with chunk-level status
- [ ] Quality review UI (flag problem sections)

---

### 3. RSS/Blog Reader
**Status**: Feed fetching exists in `lib/rss.ts`

**Workflow:**
1. Input feed URL or search term
2. Discover feed via Feedly API
3. List articles from feed
4. Extract full article content (not just summary)
5. Output: Clean markdown per article

**Existing code:**
- `rss.ts`: CORS proxy strategies, Feedly search, XML parsing

**TODO:**
- [ ] Full article extraction (reader-mode style)
- [ ] Mini-app UI (search/add feed → article list → extract)
- [ ] Subscription management (save feeds, poll for new)

---

### 4. YouTube Transcripts
**Status**: Basic extraction in `lib/youtube.ts`

**Workflow:**
1. Input YouTube URL
2. Extract auto-captions or manual captions
3. Optionally polish with Gemini
4. Output: Clean markdown with timestamps

**Existing code:**
- `youtube.ts`: Caption extraction

**TODO:**
- [ ] Mini-app UI (URL input → preview → polish options)
- [ ] Playlist/channel batch processing
- [ ] Option to upload audio for better transcription

**Known Issues:**
- YouTube scraper fails on some videos (no captions found via CORS proxy)
- Consider fallback to yt-dlp CLI for server-side extraction

---

### 5. Page Snap (Camera OCR)
**Status**: Python prototype exists in `page snap/pagesnap/`, needs web port

**Workflow:**
1. Open camera view in browser (WebRTC)
2. Frame document, capture image
3. OCR via Gemini Vision API
4. Output: Markdown (copy to clipboard or save to database)

**Existing code:**
- `pagesnap/ocr_gemini.py`: Gemini Vision prompts, image processing

**TODO:**
- [ ] Web camera UI (use `getUserMedia` API)
- [ ] Image capture/crop interface
- [ ] Port OCR logic to TypeScript (call Gemini API directly)
- [ ] Mobile-friendly UI (primary use case is phone camera)
- [ ] Fix markdown rendering in scan results (not visually appealing)

---

## Content Database Schema

All output stored as markdown with **Obsidian-style YAML frontmatter**.

### Universal Fields
```yaml
---
id: uuid-v4
title: "Content Title"
source_type: podcast | pdf | rss | youtube
source_url: "https://..."
created_at: 2024-12-21T00:00:00Z
imported_at: 2024-12-21T00:00:00Z
tags: []
---
```

### Source-Specific Fields

**Podcast:**
```yaml
feed_name: "The Naval Podcast"
episode_title: "How to Get Rich"
duration_seconds: 3600
speakers: ["Naval Ravikant", "Nivi"]
```

**PDF:**
```yaml
original_filename: "document.pdf"
page_count: 143
document_type: newsletter | book | paper
author: "Ray Peat"
```

**RSS:**
```yaml
feed_name: "Paul Graham Essays"
author: "Paul Graham"
word_count: 2500
```

**YouTube:**
```yaml
channel_name: "Lex Fridman"
video_id: "dQw4w9WgXcQ"
duration_seconds: 7200
```

---

## Development Phases

### Phase 1: Consolidate & Test (Current)
- [ ] Test existing lib utilities independently
- [ ] Decide: integrate amanuensis as Python API or rewrite in TS?
- [ ] Clean up project structure

### Phase 2: Mini-App UIs
- [ ] Podcast Transcriber UI (highest value, code mostly exists)
- [ ] PDF OCR UI (complex, needs amanuensis integration)
- [ ] RSS Reader UI
- [ ] YouTube Transcripts UI

### Phase 3: Content Database & Export
- [ ] Unified storage with frontmatter
- [ ] Content browser (list/search all imported content)
- [ ] Export to Obsidian vault structure
- [ ] Export to Notion (API or CSV)

### Phase 4: Agentic Enhancements
- [ ] RSS feed discovery agent
- [ ] Document type auto-detection
- [ ] Smart retry/recovery for OCR failures

---

## Key Decisions Needed

1. **Amanuensis integration strategy**
   - Option A: Run as separate Python API, call from web app
   - Option B: Port to TypeScript, integrate directly
   - Option C: Keep as CLI tool, integrate later

2. **Page Snap integration**
   - Port to web (WebRTC camera access) - **DECIDED: YES**
   - Mobile-first design (phone camera is primary use case)

3. **Storage backend**
   - IndexedDB only (current)?
   - Add SQLite for better queries?
   - Or just export to filesystem and let Obsidian handle it?

---

## Technical Learnings (from Ray Peat OCR project)

### PDF OCR Pipeline (Proven)
```bash
# 1. Split large PDF into 5-page chunks
python3 split-pdf.py

# 2. OCR each chunk via Gemini (saves immediately)
python3 run-ocr.py

# 3. Stitch chunks together
python3 stitch-chunks.py

# 4. Split into individual documents
python3 split-newsletters-v2.py
```

### Key Findings
- **5 pages per chunk** works reliably - no output truncation
- **Pre-split PDFs first** - loading large PDFs repeatedly hangs
- **Save each chunk immediately** - enables resume from failures
- **Gemini won't fix hyphenation** - needs post-processing regex: `r'(\w+)-\n(\w+)'` → `r'\1\2'`
- **~15-20 seconds per chunk** - budget for large docs

### Prompt Structure That Works
```
REMOVE: page numbers, addresses, headers/footers
FIX: OCR errors (but NOT hyphenation - do in post)
FORMAT: # for titles, ## for sections
OUTPUT: clean markdown only, no preambles
```

### Post-Processing Regex (stitch-chunks.py)
```python
# Fix hyphenation
text = re.sub(r'(\w{2,})-\n([a-z])', r'\1\2', text)

# Remove standalone page numbers
text = re.sub(r'\n\n(\d{1,2})\n\n', '\n\n', text)

# Normalize separators
text = re.sub(r'(\n---\n?){2,}', '\n\n---\n\n', text)
```

---

## Storage Architecture (from archived docs)

### Markdown-First Philosophy
All content → Markdown with Front Matter → enables:
- LLM-friendly documents
- Export to Obsidian/Notion
- Version control (Git-friendly)
- Progressive disclosure via metadata

### Storage Abstraction
```
Application Code
       ↓
  StorageAdapter (interface)
       ↓
  ┌────────┬──────────┬────────┐
  IndexedDB  Supabase   File
  (NOW)      (LATER)   (EXPORT)
```

Already implemented in `lib/storage/`.

---

## Test Content

- **PDF**: Cross & Plough newsletter (in `outputs/cross-plough/`)
- **PDF**: Philemon Latin texts (in `outputs/philemon/`)
- **Podcast**: Naval podcast RSS feed
- **RSS**: Paul Graham essays
- **YouTube**: Any video with auto-captions

---

## Workspace Structure (Clean)

```
Doodle Docs/
├── doodle-reader/          # Main app
│   ├── lib/                # Shared utilities
│   ├── components/         # React UI
│   ├── .context/           # This roadmap, handoffs
│   └── projects/           # Subprojects
│       └── amanuensis/     # OCR pipeline (Python)
├── page snap/              # Camera OCR (to integrate)
├── projects/
│   └── ray-peat-newsletters/  # OCR experiment (reference)
├── outputs/                # OCR test outputs
│   ├── cross-plough/
│   └── philemon/
├── archive/                # Old docs (reference only)
├── dwarkesh-content/       # Scraped content
└── CLAUDE.md               # AI instructions
```

---

*Last updated: December 22, 2024*
