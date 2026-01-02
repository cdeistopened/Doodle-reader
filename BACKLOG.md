# Doodle Reader 2.0 Backlog
## Inspired by Google Reader + Modern AI/Context Workflows

### Philosophy
- Universal Markdown as interchange format
- Context engineering: annotations travel WITH content
- Source material optimization for AI/skill-driven workflows

---

## Infrastructure: Deployment & Services

### PageSnap: Separate App Deployment ⚠️
**Status:** Currently embedded in main app but incompatible with production

**Problem:** PageSnap is a Python Flask app (camera motion detection, OpenCV) embedded in JavaScript app. Can't deploy together on Railway.

**Solution:**
- [ ] Deploy PageSnap as separate Railway service
- [ ] Create production-ready PageSnap with environment variables
- [ ] Update main app to point to production PageSnap URL
- [ ] Handle authentication/API keys between services
- [ ] Share OCR functionality between apps

**Alternative:** Simple upload-based scanning for production, keep motion detection for local development.

---

## High Priority: Stream Architecture

### 1. Everything is a Stream
> "Internally, every view in Google Reader was a Stream. This abstraction allowed the interface to treat a single feed, a folder of feeds, or a system view identically."

**Implementation:**
- [ ] Unified stream abstraction for feeds, folders, starred, shared, transcribed
- [ ] Stream → Markdown export (single item, batch, or continuous)
- [ ] Stream continuation tokens for pagination/batch AI processing
- [ ] Stream composition: combine multiple streams into custom views

**AI Workflow Value:** Any stream can be piped to an LLM context window. "Summarize my Tech folder from this week" becomes trivial.

---

### 2. Annotation Layer (Share with Note)
> "The note appeared above the shared article... users weren't just seeing a link; they were seeing WHY their friend found it interesting."

**Implementation:**
- [ ] Notes as first-class metadata on any item
- [ ] Notes persist through shares, exports, AI processing
- [ ] Quick-note keyboard shortcut (N or Shift+D)
- [ ] Note types: highlight, comment, question, action-item
- [ ] Notes exportable as markdown frontmatter

**AI Workflow Value:** Your annotations become prompt context. "Here's an article I marked as 'needs fact-check' - verify these claims."

---

### 3. Send To: Universal Pipes
> "Users could define their own integrations using variable substitution: ${url}, ${title}, ${source}"

**Implementation:**
- [ ] Custom "Send To" with variable templates
- [ ] Built-in targets: Obsidian, Notion, Readwise, local markdown file
- [ ] AI targets: "Send to Summarizer", "Send to Translator", "Send to Q&A Generator"
- [ ] Webhook support for custom workflows
- [ ] Batch send: pipe entire stream to target

**Template Variables:**
```
${url}        - Source URL
${title}      - Item title
${content}    - Full text/markdown
${snippet}    - First 500 chars
${source}     - Feed name
${date}       - Publication date
${notes}      - User annotations
${tags}       - Applied tags
${transcript} - If audio, the transcription
```

---

## Medium Priority: Triage Mechanics

### 4. Keyboard Flow State
> "The J/K navigation loop must function with zero latency, utilizing optimistic UI updates."

**Implementation:**
- [ ] J/K with optimistic mark-as-read
- [ ] S for star (instant yellow feedback)
- [ ] N for quick note modal
- [ ] T for tag picker
- [ ] P for "process with AI" (opens AI action menu)
- [ ] Shift+A mark all read with undo toast

**New AI-Augmented Keys:**
- [ ] A for AI summary overlay (non-destructive)
- [ ] Q for "queue for AI batch processing"
- [ ] E for "extract entities/facts"

---

### 5. Starred as Processing Inbox
> "Items marked with a star were saved indefinitely, functioning as a primitive 'Readwise' before those services existed."

**Implementation:**
- [ ] Starred items = "To Process" queue
- [ ] Smart folders: "Starred + Unprocessed", "Starred + Has Notes"
- [ ] Batch operations on starred: "AI summarize all", "Export all as markdown"
- [ ] Auto-unstar after processing (optional)

---

### 6. Text-First / Markdown-Native
> "The offline mode cached only the text content... This limitation reinforced the 'text-first' vibe."

**Implementation:**
- [ ] Store all content as markdown internally
- [ ] HTML → Markdown conversion on ingest
- [ ] Preserve semantic structure (headers, lists, code blocks)
- [ ] Image alt-text extraction for context
- [ ] Audio → Transcript → Markdown pipeline (already have this!)

**AI Workflow Value:** LLMs work best with clean markdown. No HTML parsing needed downstream.

---

## Lower Priority: Social/Sharing

### 7. Public Curation Feeds
> "Every user possessed a public RSS feed of their own... anyone could subscribe to your shared items."

**Implementation:**
- [ ] Personal "Shared" feed with public URL
- [ ] Shared items include your notes
- [ ] Follow other users' shared feeds within app
- [ ] "Friends' Shared Items" aggregated view

---

### 8. Trends & Self-Analytics
> "A statistical view showing reading habits, often used to prune high-volume, low-value feeds."

**Implementation:**
- [ ] Reading velocity by feed/folder
- [ ] Star rate: % of items you star per feed
- [ ] Time-to-read estimates
- [ ] AI insight: "You read 80% of Stratechery but only 10% of TechCrunch - consider unsubscribing"

---

## Technical Debt / Infrastructure

### 9. Negative Sync Strategy
> "Clients assumed everything was unread by default and synced the list of Read IDs. The client would then subtract these."

**Implementation:**
- [ ] Sync read IDs, not unread IDs
- [ ] Efficient diffing for large feed histories
- [ ] Continuation token pagination

---

### 10. Offline-First Architecture
> "Use IndexedDB for local storage, Service Workers for offline, Background Sync for replaying actions."

**Implementation:**
- [ ] Already have IndexedDB (hybrid storage)
- [ ] Add Service Worker for true offline
- [ ] Queue actions when offline, replay on reconnect

---

## Vibe Principles (Non-Negotiable)

From the report, things we must NOT do:

1. **No whitespace bloat** - Keep row height 26-28px in list view
2. **Favicons are sacred** - Visual pattern recognition > reading text
3. **Keyboard-first** - Every action has a shortcut
4. **No algorithmic sorting by default** - Chronological is king
5. **Text over media** - Dense information, not pretty pictures
6. **User controls the filter** - Folders/tags, not AI deciding what's "relevant"

---

## Quick Wins for AI Integration

| Feature | Effort | Value |
|---------|--------|-------|
| "Summarize" button per item | Low | High |
| Export starred as markdown file | Low | High |
| Batch export folder as markdown | Low | Medium |
| AI-generated tags on ingest | Medium | High |
| "Similar items" based on embeddings | Medium | Medium |
| Auto-extract key quotes/facts | Medium | High |

---

## North Star

**The ideal flow:**
1. Subscribe to feeds (RSS, podcasts, newsletters)
2. Triage with J/K (keyboard flow state)
3. Star items worth processing
4. Add notes for context
5. Batch export starred → Markdown → Obsidian/AI workflow
6. Share curated streams publicly
7. Your reading becomes your knowledge graph

---

# Session Notes (Dec 2024)

## Transcript Readability

**Problem:** Transcripts are accurate but not readable. Wall of text, no structure.

**Solution: AI Post-Processing (Structure Pass)**

After transcription, run Gemini to:
- Add paragraph breaks at topic shifts
- Generate 3-5 section headers
- Identify/label speakers
- Clean filler words (um, uh, you know)
- Extract 3-5 key quotes/points

**Output format:**
```markdown
---
summary: Discussion of AI development pace
speakers: [Host, Sarah Chen]
duration: 45:32
key_points:
  - AI moving faster than expected
  - Enterprise adoption accelerating
---

## The AI Landscape Today

**HOST:** So today we're going to talk about AI...
```

**Display improvements:**
- Narrower text column with functional margins
- Timestamps in left margin (subtle, clickable)
- Speaker labels color-coded
- Summary card at top (collapsible)
- Progressive disclosure: summary → key quotes → full transcript

---

## Transcription Model

**Default:** Gemini transcribe + Polish (1 step)
**Premium:** AssemblyAI + Polish (higher accuracy)

**Community model:**
- [ ] Once user transcribes a feed episode, it's available to ALL subscribers
- [ ] User who did work gets credit/badge
- [ ] Speaker name corrections = paid feature (extra credits)

**Monetization:**
- Free tier: X transcription minutes/month
- Pro: more minutes
- Community benefit reduces duplicate work across users

---

## Width Philosophy

| View | Width | Rationale |
|------|-------|-----------|
| List/Triage | Full | More headlines, faster scanning |
| Article/Blog | User choice | "Comfortable" (centered) vs "Full" |
| Transcript | Narrow + margins | Margins for timestamps, speakers, actions |

**Key insight:** Whitespace should be *functional* not *decorative*.

---

## Color & Favicon Principles

From Google Reader report:

- **Favicons are sacred** - Pattern recognition, don't remove
- **Semantic color** - Color = meaning (gold=star, blue=link)
- **High contrast states** - Unread vs read must be obvious
- **Don't waste bright color on rare actions** - Subscribe button shouldn't be brightest thing

### Google Reader Classic Palette (Full Hex Reference)

| Component | Hex Code | Usage |
|-----------|----------|-------|
| Primary Link Blue | #2200CC | Article titles, action links |
| Action Blue | #1558D6 | Primary buttons ("Mark all read") |
| Selection Yellow | #FFFFD6 | Current item highlight (J/K active) |
| Unread Background | #FFFFFF | Unread items |
| Read Background | #F0F0F0 | Read items (faded) |
| Text Black | #333333 | Body text (not harsh #000) |
| Snippet Grey | #777777 | List snippets, metadata |
| Border Grey | #EBEBEB | Item separation |
| Star Gold | #FFC000 | Active star icon |
| Subscribe Red | #D14836 | Google red (2011) |
| Folder Blue | #5F9EA0 | Sidebar folder highlight |
| Sidebar BG | #F6F9FF | Light blue-grey |

### Typography Specs

```css
/* Font Stack */
font-family: Arial, Helvetica, sans-serif;

/* Row Heights */
.list-item { height: 26-28px; }

/* Padding */
.list-item { padding: 2px 5px; }
.sidebar-item { padding: 1px 0px 1px 12px; }

/* Font Sizes */
.sidebar-feed { font-size: 13px; }
.list-title { font-size: 13px; font-weight: bold; } /* unread */
.list-title-read { font-size: 13px; font-weight: normal; }
.expanded-headline { font-size: 18-20px; font-weight: bold; }
```

### Design Revamp Consideration

Current Doodle palette vs Google Reader:
- [ ] Audit current colors against semantic meaning
- [ ] Ensure unread/read contrast is strong enough
- [ ] Verify star color is gold not grey
- [ ] Check link colors are distinct from body text
- [ ] Consider "Compact Density" mode toggle

---

## Send To: Modern Second Brain Integration

### Preset Templates for Digital Hygiene

**Obsidian Template:**
```
obsidian://new?vault=MyVault&file=Inbox/${title}&content=${content}

---
source: ${url}
date: ${date}
feed: ${source}
tags: ${tags}
my_notes: ${notes}
---

# ${title}

${content}
```

**Notion Template:**
```
https://api.notion.com/...
{
  "parent": { "database_id": "inbox_db" },
  "properties": {
    "Title": "${title}",
    "URL": "${url}",
    "Source": "${source}",
    "Date Read": "${date}",
    "My Notes": "${notes}"
  },
  "children": [markdown_to_blocks("${content}")]
}
```

**Readwise Template:**
```
POST https://readwise.io/api/v2/highlights/
{
  "highlights": [{
    "title": "${title}",
    "source_url": "${url}",
    "text": "${snippet}",
    "note": "${notes}"
  }]
}
```

### Second Brain Presets

- [ ] "Inbox" - Quick capture, process later
- [ ] "Reference" - Source material for projects
- [ ] "Quotes" - Key excerpts with context
- [ ] "To Summarize" - Queue for AI processing
- [ ] "Newsletter Fodder" - For Writer app curation

### Setup Wizard

Help users configure good hygiene:
1. Connect Obsidian/Notion/Readwise
2. Choose default template
3. Set up folder structure
4. Configure keyboard shortcut (e.g., O for Obsidian)

---

## Reader vs Writer Architecture

**Reader = Input/Consumption/Triage**
- Fast, keyboard-driven
- Volume handling
- Binary decisions (keep/skip)
- Extraction (transcribe, OCR)

**Writer = Output/Production/Transformation**
- Slow, deliberate
- Composition/arrangement
- Multi-step transformation
- Publishing (newsletter, social, blog)

**Shared Data Layer:**
- Items (normalized markdown)
- Annotations/notes
- Tags/folders
- Source metadata

**Integration point:** Markdown + annotations travel between apps.

---

## Social Clip Sharing

**In Reader (lightweight):**
- [ ] Select text in transcript (has timestamp data)
- [ ] "Share Clip" → ffmpeg cuts audio at timestamps
- [ ] Output: 30-90 sec audio + text quote
- [ ] Share to Twitter/Threads

**In Writer (full featured):**
- Multi-clip remix
- Audiogram generation (waveform + captions)
- Timeline editing
- Export for TikTok/Reels/Shorts

**Monetization:** Clip generation = credits (compute cost)

---

## Future: Writer App Scope

Separate domain, shared data with Reader:

- Canvas for arranging source material
- AI transformations (summarize, expand, restyle)
- Templates (weekly roundup, thread format, newsletter)
- Publishing integrations
- Audiogram/video clip creation

**Not in Reader** - different cognitive mode, would slow down triage flow.

---

## Typography Strategy

### Current State (Keep)

Beautiful editorial system already in place:
- **Spectral** - refined serif for content
- **Libre Baskerville** - classic book typography for polished content
- **DM Sans** - modern geometric sans for UI
- **IBM Plex Mono** - code

Features: drop caps, text indent, justified text, decorative blockquotes, gradient HRs

### The Hybrid Philosophy

| Context | Typography | Density | Class |
|---------|------------|---------|-------|
| List/Triage | DM Sans, tight | Dense (GReader style) | existing |
| Article Reading | Spectral/Libre Baskerville | Beautiful (current) | `.prose-polished` |
| Transcripts | Spectral, simpler | Middle ground | `.prose-transcript` (new) |

### Proposed: `.prose-transcript`

Transcripts need different treatment than articles:
- NO drop caps (doesn't make sense for dialogue)
- NO justified text (fights speaker format)
- NO text indent (breaks flow)
- YES speaker labels (prominent)
- YES timestamps (functional margin)
- YES section headers (AI-generated)

```css
/* ========================================
   TYPOGRAPHY - TRANSCRIPTS
   Optimized for podcast/video transcripts
   ======================================== */
.prose-transcript {
  font-family: var(--font-serif);
  font-size: 1rem;
  line-height: 1.7;
  color: var(--ink);
  max-width: 600px;  /* Narrower for readability */
}

.prose-transcript p {
  margin-bottom: 1rem;
  text-align: left;  /* NOT justified */
}

/* Speaker labels */
.prose-transcript .speaker {
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-top: 1.5rem;
  margin-bottom: 0.25rem;
  display: block;
}

/* Timestamp markers */
.prose-transcript .timestamp {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ink-muted);
  margin-right: 0.5rem;
}

/* AI-generated section headers */
.prose-transcript .section-header {
  font-family: var(--font-serif);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ink);
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--accent);
}

/* Key quote callouts */
.prose-transcript .key-quote {
  background: var(--cream-warm);
  border-left: 3px solid var(--accent-warm);
  padding: 0.75rem 1rem;
  margin: 1rem 0;
  font-style: italic;
}

/* Summary card at top */
.transcript-summary {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.transcript-summary h4 {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-muted);
  margin-bottom: 0.5rem;
}

.transcript-summary ul {
  margin: 0;
  padding-left: 1.25rem;
}

.transcript-summary li {
  font-size: 0.9375rem;
  margin-bottom: 0.25rem;
}
```

### Layout: Transcript with Functional Margins

```
┌──────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────┐ │
│ │ 📝 Key Points                                    │ │
│ │ • AI moving faster than expected                │ │
│ │ • Enterprise adoption accelerating              │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│  [0:00]    ## The AI Landscape Today                │
│                                                      │
│  HOST      So today we're going to talk about AI.   │
│            There's been a lot of development.       │
│                                                      │
│  [2:15]    SARAH                                    │
│   ★        I was talking to someone who said the    │
│            technology is moving faster than expected│
│                                                      │
│  [4:30]    ## Enterprise Adoption                   │
│                                                      │
└──────────────────────────────────────────────────────┘
     ↑              ↑
  Timestamps     Narrower text (50-60 char)
  + stars        Left-aligned, not justified
```

### Density Mode Toggle (Future)

For power users who want Google Reader density in list view:

```css
/* Compact density mode */
.density-compact .list-item {
  padding: 0.25rem 0.75rem;  /* Tighter than current 0.75rem 1rem */
}

.density-compact .list-item-title {
  font-size: 0.875rem;  /* Slightly smaller */
}

.density-compact .list-item-meta {
  font-size: 0.75rem;
}
```

Toggle in settings: "Comfortable" (default) vs "Compact"

---

## Audit Checklist

Before implementing, audit current app against these:

### Color Semantics
- [ ] Star icon: Is it gold when active? (should be `#FFC000` or `--warning`)
- [ ] Links: Distinct from body text? (current: `--accent` teal)
- [ ] Unread/Read: Strong enough contrast?
- [ ] Selection highlight: Visible but not harsh?

### List View Density
- [ ] Current row height vs target 26-28px?
- [ ] Current padding vs target 2px 5px?
- [ ] Snippet visible without expanding?

### Sidebar
- [ ] Favicons present and prominent?
- [ ] Unread counts bold?
- [ ] Folder/feed hierarchy clear?

### Transcript-Specific
- [ ] Speaker labels clear?
- [ ] Timestamps accessible but not intrusive?
- [ ] Section breaks from AI polish?
- [ ] Key quotes highlighted?
