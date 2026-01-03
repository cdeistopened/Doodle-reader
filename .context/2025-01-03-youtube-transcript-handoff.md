# YouTube Transcript Integration - RESOLVED
*Date: 2025-01-03 (Updated)*

## Status: WORKING

YouTube transcript fetching and polishing now functional in production.

## What Was Fixed

### 1. Apify Actor Configuration
**Problem:** The original actor `insight_api_labs/youtube-transcript` was rejecting all URL formats with "invalid URLs" error.

**Solution:** Switched to `scrape-creators/best-youtube-transcripts-scraper` which:
- Uses `videoUrls` (camelCase) not `video_urls`
- Returns `transcript_only_text`, `transcript`, `title`, `thumbnail`
- Actually works

**Files changed:**
- `start-railway.js` - Updated actor ID and input format

### 2. Transcript Disappearing After Polish/Summarize
**Problem:** When user clicked Polish or Summarize, the transcript would vanish from the UI.

**Root cause:** A `useEffect` in `FeedList.tsx` was resetting `rawTranscript` to null whenever `item.aiSummary` changed (which happens after any transform).

**Solution:** Split into two separate useEffects:
- One syncs `transformOutputs` when `aiSummary` changes
- One resets `rawTranscript` only when `item.id` changes (navigation)

**Files changed:**
- `components/FeedList.tsx` - Split useEffect
- `lib/youtube.ts` - Removed reference to `segments` in log message

## Current Architecture

```
User pastes YouTube URL
       ↓
Frontend extracts videoId
       ↓
Calls /api/youtube/transcript?videoId=XXX
       ↓
start-railway.js calls Apify actor
       ↓
Returns { transcript, title, thumbnail }
       ↓
User clicks Polish/Summarize
       ↓
TransformPanel sends to Gemini
       ↓
Result saved to aiSummary, transcript persists
```

## Test Commands

```bash
# Local test of Apify integration
cd doodle-reader
node test-apify.js

# Direct API test (after Railway deploys)
curl "https://YOUR-RAILWAY-URL/api/youtube/transcript?videoId=LphE5N1NqLU"
```

## Environment Variables (Railway)

- `APIFY_API_TOKEN` - Required for YouTube transcripts
- `VITE_GEMINI_API_KEY` - For transcript polishing

## Commits

1. `6603836` - Fix YouTube transcripts: switch to working Apify actor
2. `781a061` - Fix transcript disappearing after polish/summarize

---
*Handoff ready for next session*
