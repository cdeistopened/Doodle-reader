# Doodle Reader CLI Tools

Command-line utilities for bulk content extraction and transcription.

## Existing Tools

### PDF OCR (`pdf-ocr.js`)

Converts PDFs to clean Markdown using Gemini 3 Flash.

```bash
# Single PDF
node pdf-ocr.js document.pdf

# Folder of PDFs
node pdf-ocr.js ./pdfs-folder

# Custom output directory
node pdf-ocr.js document.pdf --output ./my-output

# Latin text mode (restores æ, œ diacriticals)
node pdf-ocr.js medieval-text.pdf --latin
```

**Features:**
- Auto-detects page count via qpdf
- Chunks into 6-page segments for optimal processing
- Auto-detects: Latin text, scholarly content, columns, footnotes
- Outputs clean Markdown with proper formatting

**Requirements:** `qpdf` (`brew install qpdf`)

---

## Proposed Tools

### Podcast Transcriber (`podcast-transcribe.js`)

Bulk transcription from podcast RSS feeds.

```bash
# Transcribe all episodes from a feed
node podcast-transcribe.js https://feeds.simplecast.com/54nAGcIl

# Limit to N most recent episodes
node podcast-transcribe.js <feed-url> --limit 10

# Output to specific directory
node podcast-transcribe.js <feed-url> --output ./transcripts

# Use AssemblyAI instead of Gemini (default)
node podcast-transcribe.js <feed-url> --provider assemblyai

# Resume interrupted batch (skips existing files)
node podcast-transcribe.js <feed-url> --resume
```

**Features:**
- Parses RSS feed for audio enclosures
- Downloads audio to temp directory
- Transcribes via Gemini (default) or AssemblyAI
- Speaker diarization from episode metadata
- Outputs as Markdown with frontmatter (title, date, duration, speakers)
- Progress bar with ETA
- Handles rate limits gracefully

**Implementation Notes:**
- Reuse `lib/rss.ts` feed parsing logic
- Reuse `lib/gemini-transcribe.ts` for transcription
- Store intermediate results for crash recovery
- Support OPML import for batch processing multiple feeds

---

### YouTube Transcriber (`youtube-transcribe.js`)

Fetch transcripts from YouTube videos or channels.

```bash
# Single video (auto-captions or manual)
node youtube-transcribe.js https://youtube.com/watch?v=VIDEO_ID

# Entire channel (all videos)
node youtube-transcribe.js https://youtube.com/@ChannelHandle --all

# Playlist
node youtube-transcribe.js https://youtube.com/playlist?list=PLAYLIST_ID

# Recent N videos from channel
node youtube-transcribe.js https://youtube.com/@ChannelHandle --limit 20

# Fallback: download audio + transcribe if no captions
node youtube-transcribe.js <url> --fallback-transcribe

# Output directory
node youtube-transcribe.js <url> --output ./transcripts
```

**Features:**
- Uses yt-dlp for reliable caption/subtitle extraction
- Supports auto-generated captions in 100+ languages
- Fallback to audio download + Gemini transcription when no captions
- Deduplicates VTT overlapping timestamps
- Channel/playlist enumeration via yt-dlp
- Outputs Markdown with video metadata

**Implementation Notes:**
- Wrap existing `projects/yt-transcript-service/` logic
- Add channel enumeration: `yt-dlp --flat-playlist --print id <channel-url>`
- For fallback: `yt-dlp -x --audio-format mp3 <url>` then transcribe

---

### Batch Runner (`batch-transcribe.js`)

Process multiple sources from a config file.

```bash
# Run batch from config
node batch-transcribe.js sources.json

# Dry run (show what would be processed)
node batch-transcribe.js sources.json --dry-run
```

**Config format (`sources.json`):**
```json
{
  "output": "./transcripts",
  "sources": [
    {
      "type": "podcast",
      "url": "https://feeds.simplecast.com/54nAGcIl",
      "limit": 10
    },
    {
      "type": "youtube-channel",
      "url": "https://youtube.com/@ChannelHandle",
      "limit": 20
    },
    {
      "type": "youtube-video",
      "url": "https://youtube.com/watch?v=VIDEO_ID"
    },
    {
      "type": "pdf",
      "path": "./pdfs/*.pdf"
    }
  ]
}
```

---

## Shared Infrastructure

### Environment Variables

All CLI tools use the same env vars as the main app:

```bash
# Required
GEMINI_API_KEY=...          # For transcription and OCR

# Optional
ASSEMBLYAI_API_KEY=...      # Alternative transcription provider
APIFY_API_TOKEN=...         # For YouTube (if not using yt-dlp)
```

### Output Format

All tools output Markdown with YAML frontmatter:

```markdown
---
title: "Episode Title"
source: "Podcast Name"
date: 2026-01-08
duration: "26:13"
speakers:
  - Rachel Abrams
  - Benjamin Mueller
url: https://original-url.com
transcribed_at: 2026-01-08T14:30:00Z
provider: gemini
---

## Summary

Brief summary of content...

## Transcript

**Speaker 1:** Content...
```

### Error Handling

- All tools should gracefully handle:
  - Network failures (retry with exponential backoff)
  - Rate limits (pause and resume)
  - Partial failures (save progress, skip failed items)
  - Interrupted runs (resume from checkpoint)

---

## Priority Order

1. **Podcast Transcriber** - Highest value, uses existing code
2. **YouTube Transcriber** - yt-dlp makes this reliable
3. **Batch Runner** - Orchestration layer for automation
