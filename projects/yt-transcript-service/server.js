#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { YoutubeTranscript } = require('youtube-transcript');

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Helper to extract video ID from URL or direct ID
function extractVideoId(input) {
  if (!input) return null;
  
  // If it's already just an ID (11 characters), return as-is
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }
  
  // Extract from various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Strategy 1: Use youtube-transcript library (fastest)
async function getTranscriptViaLibrary(videoId) {
  try {
    console.log(`[Library] Fetching transcript for ${videoId}...`);
    const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (transcriptArray && transcriptArray.length > 0) {
      // Convert array of transcript objects to plain text
      const transcript = transcriptArray
        .map(item => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      console.log(`[Library] Success: ${transcript.length} characters`);
      return {
        success: true,
        transcript: transcript,
        source: 'youtube-transcript',
        duration: `${transcriptArray.length} segments`
      };
    }
    
    return null;
  } catch (error) {
    console.log(`[Library] Failed: ${error.message}`);
    return null;
  }
}

// Strategy 2: Use yt-dlp (most comprehensive)
async function getTranscriptViaYtDlp(videoId) {
  return new Promise((resolve) => {
    console.log(`[yt-dlp] Fetching transcript for ${videoId}...`);
    
    // Use yt-dlp to get transcript
    const ytdlp = spawn('yt-dlp', [
      '--write-auto-sub',
      '--write-sub',
      '--sub-lang', 'en',
      '--sub-format', 'vtt',
      '--skip-download',
      '--output', `/tmp/%(title)s.%(ext)s`,
      `https://www.youtube.com/watch?v=${videoId}`
    ]);

    let output = '';
    let error = '';

    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      error += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        // Try to find and read the generated subtitle file
        const { exec } = require('child_process');
        exec('find /tmp -name "*.vtt" -newer /tmp -exec cat {} \\;', (err, stdout) => {
          if (!err && stdout.trim()) {
            // Parse VTT format to plain text
            const transcript = stdout
              .split('\n')
              .filter(line => 
                line.trim() && 
                !line.includes('-->') && 
                !line.includes('WEBVTT') &&
                !line.match(/^\d+$/)
              )
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            if (transcript.length > 100) {
              console.log(`[yt-dlp] Success: ${transcript.length} characters`);
              resolve({
                success: true,
                transcript: transcript,
                source: 'yt-dlp',
                duration: 'auto-captions'
              });
              return;
            }
          }
          
          console.log(`[yt-dlp] Failed: No transcript content found`);
          resolve(null);
        });
      } else {
        console.log(`[yt-dlp] Failed with code ${code}: ${error}`);
        resolve(null);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      ytdlp.kill();
      console.log(`[yt-dlp] Timeout for ${videoId}`);
      resolve(null);
    }, 30000);
  });
}

// Main endpoint
app.get('/transcript', async (req, res) => {
  const { v: videoInput, url } = req.query;
  const input = videoInput || url;
  
  if (!input) {
    return res.status(400).json({
      error: 'Missing video ID or URL. Use ?v=VIDEO_ID or ?url=YOUTUBE_URL'
    });
  }

  const videoId = extractVideoId(input);
  if (!videoId) {
    return res.status(400).json({
      error: 'Invalid YouTube URL or video ID',
      provided: input
    });
  }

  console.log(`\n=== Fetching transcript for ${videoId} ===`);

  try {
    // Strategy 1: Try youtube-transcript library first (faster)
    let result = await getTranscriptViaLibrary(videoId);
    if (result && result.transcript) {
      return res.json(result);
    }

    // Strategy 2: Try yt-dlp if library fails
    result = await getTranscriptViaYtDlp(videoId);
    if (result && result.transcript) {
      return res.json(result);
    }

    // No transcript found
    return res.status(404).json({
      error: 'No transcript found',
      videoId: videoId,
      strategies_tried: ['youtube-transcript', 'yt-dlp']
    });

  } catch (error) {
    console.error('Transcript service error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'yt-transcript-service',
    port: PORT,
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'YouTube Transcript Service',
    version: '1.0.0',
    endpoints: {
      '/transcript?v=VIDEO_ID': 'Get transcript for YouTube video',
      '/health': 'Service health check'
    },
    example: `${req.protocol}://${req.get('host')}/transcript?v=dQw4w9WgXcQ`
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎬 YouTube Transcript Service`);
  console.log(`📡 Running on: http://localhost:${PORT}`);
  console.log(`🔗 Test URL: http://localhost:${PORT}/transcript?v=dQw4w9WgXcQ`);
  console.log(`💡 For Doodle Reader: Set YT_TRANSCRIPT_SERVICE_URL=http://localhost:${PORT}`);
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Shutting down YouTube Transcript Service...');
  process.exit(0);
});