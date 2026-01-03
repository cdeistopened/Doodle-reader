#!/usr/bin/env node

/**
 * Railway startup script that runs both the static file server 
 * and the YouTube transcript API server on the same port
 */

import express from 'express';
import cors from 'cors';
import { YoutubeTranscript } from 'youtube-transcript';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// API Routes
// Health check for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'doodle-reader-with-youtube-api',
    timestamp: new Date().toISOString()
  });
});

// YouTube transcript API endpoint
app.get('/api/youtube/transcript', async (req, res) => {
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({
      error: 'Missing videoId parameter',
      usage: '/api/youtube/transcript?videoId=VIDEO_ID'
    });
  }
  
  console.log(`[YouTube API] Fetching transcript for video: ${videoId}`);
  
  try {
    const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcriptArray || transcriptArray.length === 0) {
      console.log(`[YouTube API] No transcript found for ${videoId}`);
      return res.status(404).json({
        error: 'No transcript found',
        videoId,
        message: 'This video may not have captions enabled or may be private'
      });
    }
    
    const transcript = transcriptArray
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`[YouTube API] Success: ${transcript.length} chars, ${transcriptArray.length} segments`);
    
    res.json({
      success: true,
      videoId,
      transcript,
      metadata: {
        length: transcript.length,
        segments: transcriptArray.length,
        firstSegment: transcriptArray[0],
        lastSegment: transcriptArray[transcriptArray.length - 1]
      }
    });
    
  } catch (error) {
    console.error(`[YouTube API] Error for ${videoId}:`, error.message);
    
    let statusCode = 500;
    let errorMessage = error.message || 'Failed to fetch transcript';
    
    if (error.message?.includes('Could not retrieve a transcript')) {
      statusCode = 404;
      errorMessage = 'No transcript available (captions may be disabled or video may be private)';
    } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      statusCode = 429;
      errorMessage = 'Rate limited by YouTube - please try again later';
    }
    
    res.status(statusCode).json({
      error: errorMessage,
      videoId
    });
  }
});

// Static file serving from dist/
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  try {
    const indexPath = join(__dirname, 'dist', 'index.html');
    const indexHtml = readFileSync(indexPath, 'utf8');
    res.send(indexHtml);
  } catch (error) {
    console.error('Error serving index.html:', error);
    res.status(500).send('Application failed to load');
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Doodle Reader with YouTube API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`App: http://localhost:${PORT}`);
  console.log(`YouTube API: http://localhost:${PORT}/api/youtube/transcript?videoId=VIDEO_ID`);
});