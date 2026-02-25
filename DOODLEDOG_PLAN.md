# DoodleDog: Cora for Information Streams

## Context

**What we're building:** A digest service that monitors your information streams, curates and summarizes new content, and delivers it as a beautiful email digest on your schedule. Each item links to a hosted reader page optimized for mobile — think Pocket/Instapaper meets AI curation. **Current 30-day MVP scope is email-first with RSS + YouTube channel RSS sources only.**

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

## 30-Day MVP Lock (Agreed Feb 24, 2026)

1. **Core promise:** Get one sharp digest from chosen sources, with clear summaries and why each item matters.
2. **MVP loop:** Add feeds once → receive daily digest email → open 1-2 items in hosted reader → save/share best item.
3. **Output format:** Email-first, web-reader second.
4. **Source scope:** RSS + YouTube channel RSS only for v1.
5. **Primary success metric:** `% of activated users who open at least 3 digests in week 2` (target: **35%+** in first 30 days).

## Strict MVP Cut List (Out For First 30 Days)

- Podcast ingestion/transcription expansion beyond existing feed support
- Social platform ingestion (Twitter/X, TikTok, Reddit workflows)
- Slack delivery
- Advanced stream wizard UX and full stream management dashboard
- Boards/highlights/note-taking in public reader
- OpenClaw packaging and unified external API key rollout

## Two-Week Execution Plan (Feb 25-Mar 10, 2026)

### Week 1 (Email quality + activation)

1. Improve digest quality and consistency for email-first UX (`doodle-reader-r7m`)
2. Reduce time-to-first-digest with a narrow activation flow (`doodle-reader-k2t`)

### Week 2 (Retention instrumentation)

1. Instrument week-2 retention metric from email and reader events (`doodle-reader-v9q`)
2. Build a lightweight KPI view/query for the week-2 open target (`doodle-reader-x4n`)

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

- Retention instrumentation for week-2 KPI tracking
- Activation-focused setup flow for first digest
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

### 1d. Email delivery — DONE

- **Service:** Resend (simple, good free tier, great DX)
- **Template:** HTML email with stream name + date header, per-item cards, reader links + original links
- **Storage:** Persist rendered `digestHtml` to `digestRuns` for hosted viewing/debugging
- **Config:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `DOODLEDOG_APP_URL`

### 1e. Convex cron job — DONE

`convex/crons.ts` runs hourly, triggers `internal.digests.processActiveStreams`.

---

## Phase 2: Hosted Reader Page

**Goal:** Click an item in the digest email → beautiful, mobile-optimized page with full content.

### 2a. Public digest route — DONE

`/read/:digestRunId/:itemIndex` — no login required, shareable URL.

### 2b. Reader features — PARTIAL

- Progressive disclosure: summary → full content
- Save/highlight (if logged in) — pending
- View original link
- Previous/next navigation
- Reuse `.prose-polished` typography

### 2c. Digest overview page — DONE

`/digest/:digestRunId` — all items as cards, mini-magazine layout.

### Files created

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
- **Podcast/social source expansion** — postponed until MVP retention target is met.
- **OpenClaw skill packaging** — postponed until core email-reader loop retention is validated.

---

## Implementation Order

1. ~~**Phase 1a+1b** — Stream schema + digest pipeline~~ DONE
2. ~~**Phase 1c** — Server-safe RSS parser~~ DONE
3. ~~**Phase 1d** — Email delivery (Resend)~~ DONE
4. ~~**Phase 2a/2c** — Hosted reader public routes + overview~~ DONE
5. **MVP Sprint Week 1** — Email quality + activation flow
6. **MVP Sprint Week 2** — Retention instrumentation + KPI view
7. **Phase 3/4/5 expansion** — Only after MVP metric validation

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
