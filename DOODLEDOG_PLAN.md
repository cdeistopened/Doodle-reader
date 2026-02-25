# DoodleDog: Cora for Information Streams

## Context

**What we're building:** A digest service that monitors your information streams (RSS, YouTube, podcasts, newsletters, social), curates and summarizes new content, and delivers it as a beautiful email digest on your schedule. Each item links to a hosted reader page optimized for mobile — think Pocket/Instapaper meets AI curation.

**Why:** Google Reader died. RSS readers are for power users. Most people want curated, summarized content delivered to them — not another app to check. Cora proved this works for email ($20/mo, 2,500 beta users). DoodleDog does it for information streams.

**Business model:** One API key = access to all underlying services (Gemini, YouTube, Apify, etc.). Usage-based billing via existing Stripe integration. Users don't manage 7 API keys — they get one DoodleDog key.

**What exists:** Doodle Reader is a working web app with RSS feeds, podcast transcription, YouTube transcripts, PDF OCR, AI transforms, Clerk auth, Stripe billing, Convex backend + IndexedDB. Beautiful editorial typography (Spectral/Libre Baskerville). The capabilities exist but are trapped inside a browser app.

**Reference product:** [Cora by Every.to](https://cora.computer/) — AI email digest, $20/mo. Opens to summary, click through to full content. DoodleDog = same pattern but for RSS/YouTube/podcasts/social instead of email.

---

## Vocabulary

| Term | Definition | Example |
|------|-----------|---------|
| **Feed** | A single source of content | Stratechery RSS, Lex Fridman YouTube channel |
| **Stream** | A cluster of feeds around a topic or interest | "AI & Tech" stream = Hacker News + a16z blog + Lex Fridman + @karpathy |
| **Digest** | A curated, time-boxed output from a stream | "Your AI & Tech digest for Feb 24" |
| **Board** | Saved/highlighted items across streams (read-it-later) | Like Pocket's saved list |

---

## Current Status (Feb 2026)

### What's Built (Phase 1 — Partial)

- **Stream data model** — `streams` and `digestRuns` tables in `convex/schema.ts`
- **Digest generation pipeline** — `convex/digests.ts` (actions), `convex/digestHelpers.ts` (queries/mutations)
- **OPML import** — `convex/opml.ts` parses Feedly exports, classifies sources, creates streams
- **Cron job** — `convex/crons.ts` runs hourly to trigger digest processing
- **Server-safe RSS** — `fast-xml-parser` based parsing in digests.ts
- **Resend delivery + HTML persistence** — `convex/digests.ts` sends digest email, stores `digestHtml`, and generates reader links
- **Public reader routes** — `/digest/:digestRunId` and `/read/:digestRunId/:itemIndex` with `convex/publicDigests.ts`
- **Local test script** — `test-digest.js` runs the full pipeline locally (fetch → summarize → compose → HTML)
- **Convex project** — `doodle-reader-76a04` at `enduring-wombat-881.convex.cloud`

### What's NOT Built Yet

- Stream management UI (Phase 3)
- Save-for-later / boards (Phase 4)
- Clerk auth not yet configured for Convex (auth.config.ts is conditional)

### Key Decisions Made

- Convex Node.js constraint: queries/mutations must live in non-`"use node"` files → `digestHelpers.ts`
- Clerk auth made optional so digest engine works without it
- Per-source item capping (max 2 per source) prevents feed dominance
- 5 test streams defined in test-digest.js: tier1 (9 feeds), ai (12), homeschool (19), blogs (15), charlie (9)

---

## ClawHub Ecosystem Audit (Reference)

| Skill | What it adds | Priority |
|-------|-------------|----------|
| **video-transcript-downloader** | `yt-dlp` for multi-platform video (TikTok, Twitter, Vimeo) | High |
| **youtube-api-skill** | YouTube Data API v3 for channel monitoring, search | High |
| **markdown-converter** | `markitdown` for PDF, EPub, Word → Markdown | Medium |
| **web-search-plus** | 6 search providers with auto-routing | Medium |

OpenClaw skill packaging is a **separate track** — not blocking the MVP.

---

## Phase 1: Digest Engine MVP

**Goal:** Send yourself a daily email digest with AI summaries of new content from configured sources.

### 1a. Stream data model — DONE

Tables added to `convex/schema.ts`: `streams` (with by_user, by_active indexes) and `digestRuns` (with by_stream, by_user indexes).

### 1b. Digest generation pipeline — DONE

`convex/digests.ts` + `convex/digestHelpers.ts`:
1. **Collect** — Fetch new items from all sources since `lastRun`
2. **Summarize** — Gemini generates 2-3 sentence summaries
3. **Compose** — Gemini creates editorial digest with transitions
4. **Record** — Save to digestRuns, update lastRun

### 1c. Server-safe RSS fetching — DONE

Uses `fast-xml-parser` in digests.ts action (Node.js runtime). Handles RSS 2.0, Atom, and RDF formats.

### 1d. Email delivery — TODO

- **Service:** Resend (simple, good free tier, great DX)
- **Template:** HTML email with stream name + date header, per-item cards, "Read more →" links
- **Styling:** Inline CSS derived from existing editorial typography

### 1e. Convex cron job — DONE

`convex/crons.ts` runs hourly, triggers `internal.digests.processActiveStreams`.

---

## Phase 2: Hosted Reader Page

**Goal:** Click an item in the digest email → beautiful, mobile-optimized page with full content.

### 2a. Public digest route

`/read/:digestRunId/:itemIndex` — no login required, shareable URL.

### 2b. Reader features

- Progressive disclosure: summary → full content
- Save/highlight (if logged in)
- View original link
- Previous/next navigation
- Reuse `.prose-polished` typography

### 2c. Digest overview page

`/digest/:digestRunId` — all items as cards, mini-magazine layout.

### Files to create

| File | Purpose |
|------|---------|
| `components/DigestReader.tsx` | Individual item reader |
| `components/DigestOverview.tsx` | Digest card layout |
| `convex/publicDigests.ts` | Public queries (no auth) |
| Router config | Add `/read/` and `/digest/` routes |

---

## Phase 3: Stream Management UI

**Goal:** Create and manage streams through the web app.

- Stream creation wizard (name, sources, filters, schedule, delivery, voice)
- Stream dashboard (list, run now, edit/pause/delete)
- OPML import for bootstrapping

---

## Phase 4: Board / Save-for-Later

**Goal:** Pocket/Instapaper-like save from digest reader. Highlights, notes, Obsidian export.

Builds on existing `boards` and `boardItems` tables.

---

## Phase 5: OpenClaw Skills + API Key

**Goal:** Package DoodleDog capabilities as OpenClaw skills. Unified API key. Usage metering.

Intentionally AFTER the core product works.

---

## Backlog (Noted for Later)

- **Slack delivery** — Add optional `slackChannel` to streams. Format as Slack blocks, post via webhook.
- **Podcast/YouTube enrichment** — Each stream needs more multimedia sources. YouTube Data API for channel discovery.
- **Merge OpenEd curation feeds** — 64 verified homeschool/ed feeds in OpenEd RSS curation skill (FEEDS.md), many not in Feedly OPML. Union = comprehensive Homeschool stream. Includes 5 Google News alerts.

---

## Implementation Order

1. ~~**Phase 1a+1b** — Stream schema + digest pipeline~~ DONE
2. ~~**Phase 1c** — Server-safe RSS parser~~ DONE
3. **Phase 1d** — Email delivery (Resend) ← NEXT
4. **Phase 2** — Hosted reader page
5. **Phase 3** — Stream creation wizard
6. **Phase 4** — Save-for-later / boards
7. **Phase 5** — OpenClaw packaging

---

## Critical Existing Files to Reuse

| File | What to reuse |
|------|--------------|
| `lib/rss.ts` | Feed parsing logic (adapt for server-side) |
| `lib/feedDiscovery.ts` | Multi-strategy feed discovery for stream wizard |
| `lib/transforms/executor.ts` | Gemini API call pattern for summarization |
| `lib/youtube.ts` | YouTube transcript fetching |
| `convex/schema.ts` | Existing boards/boardItems tables |
| `convex/newsletters.ts` | Newsletter-to-RSS pattern |
| `index.css` | Editorial typography (Spectral, Libre Baskerville, prose-polished) |
| `api-server.js` | Express server to extend with API endpoints |

## Open Questions

- **Resend vs other email service** — Resend recommended for DX but user may have preferences.
- **YouTube channel monitoring** — YouTube RSS feeds exist but may need YouTube Data API for channel discovery.
