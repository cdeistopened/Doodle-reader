# Doodle Reader

A playful, powerful RSS reader for converting content to clean markdown. Supports RSS feeds, podcasts, YouTube transcripts, and PDF OCR.

## Features

- **RSS/Atom Feed Reading** - Subscribe to any feed and read articles
- **YouTube Transcript Fetching** - Fetch transcripts from YouTube videos
- **AI-Powered Summaries** - Generate summaries using Google Gemini
- **PDF OCR** - Scan PDFs with Tesseract.js and OCR
- **Podcast Transcription** - Transcribe audio with AssemblyAI
- **Multiple View Modes** - List, Expanded, and Detail views
- **Keyboard Navigation** - Vim-style shortcuts (j/k for navigation)

## Development

### Prerequisites
- Node.js >= 18.0.0

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and add your API keys:

```bash
cp .env.example .env.local
```

Required keys:
- `VITE_GEMINI_API_KEY` - Google Gemini API key for AI summaries
- `VITE_ASSEMBLYAI_API_KEY` - AssemblyAI API key for podcast transcription

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Deployment

This app is built with Vite and can be deployed to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| j   | Next item |
| k   | Previous item |
| m   | Toggle read status |
| s   | Toggle star |
| v   | Open original in new tab |
| Enter/o | Open item |
| Escape | Back to list |
| 1 | List view |
| 2 | Expanded view |

## License

Private
