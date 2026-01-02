# YouTube Transcript Service

A reliable local service for fetching YouTube video transcripts using multiple strategies.

## Quick Start

```bash
# Install dependencies
npm install

# Start the service
npm start

# Test it works
npm test
```

## Usage

The service runs on `http://localhost:3002` and provides:

### Get Transcript
```
GET /transcript?v=VIDEO_ID
GET /transcript?url=YOUTUBE_URL
```

Examples:
- `http://localhost:3002/transcript?v=dQw4w9WgXcQ`
- `http://localhost:3002/transcript?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ`

### Health Check
```
GET /health
```

## Response Format

Success:
```json
{
  "success": true,
  "transcript": "The full transcript text...",
  "source": "youtube-transcript",
  "duration": "150 segments"
}
```

Error:
```json
{
  "error": "No transcript found",
  "videoId": "dQw4w9WgXcQ",
  "strategies_tried": ["youtube-transcript", "yt-dlp"]
}
```

## Strategies

The service tries multiple strategies in order:

1. **youtube-transcript library** - Fast, works for most videos with auto-captions
2. **yt-dlp** - Slower but more comprehensive, handles edge cases

## Requirements

- Node.js 16+
- `yt-dlp` (optional, for fallback strategy)

Install yt-dlp:
```bash
# macOS
brew install yt-dlp

# Or use npm script
npm run install-yt-dlp
```

## Integration with Doodle Reader

The Doodle Reader app expects this service at `http://localhost:3002`. 

When the service is running, YouTube transcript fetching becomes much more reliable!