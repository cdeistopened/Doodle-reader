#!/usr/bin/env node

/**
 * YouTube Transcript API Server for Railway deployment
 * 
 * This Express server provides YouTube transcript functionality
 * that bypasses CORS restrictions using the youtube-transcript package.
 * 
 * Endpoints:
 * GET /api/youtube/transcript?videoId=VIDEO_ID
 * GET /health (Railway health check)
 * 
 * Usage:
 * npm run api-server
 * 
 * Railway deployment:
 * - Runs alongside the Vite build 
 * - Serves on PORT environment variable
 * - Handles transcript API calls server-side
 */

import express from 'express';
import cors from 'cors';
import { YoutubeTranscript } from 'youtube-transcript';

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins (adjust for production)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://doodlereader.com', 'https://*.railway.app']
    : true,
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Health check for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'youtube-transcript-api',
    timestamp: new Date().toISOString()
  });
});

// YouTube transcript endpoint
app.get('/api/youtube/transcript', async (req, res) => {
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({
      error: 'Missing videoId parameter',
      usage: '/api/youtube/transcript?videoId=VIDEO_ID'
    });
  }
  
  console.log(`[API] Fetching transcript for video: ${videoId}`);
  
  try {
    // Use the proven youtube-transcript package
    const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcriptArray || transcriptArray.length === 0) {
      console.log(`[API] No transcript found for ${videoId}`);
      return res.status(404).json({
        error: 'No transcript found',
        videoId,
        message: 'This video may not have captions enabled or may be private'
      });
    }
    
    // Convert to plain text
    const transcript = transcriptArray
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`[API] Success: ${transcript.length} chars, ${transcriptArray.length} segments`);
    
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
    console.error(`[API] Error for ${videoId}:`, error.message);
    
    // Categorize common errors
    let statusCode = 500;
    let errorMessage = error.message || 'Failed to fetch transcript';
    
    if (error.message?.includes('Could not retrieve a transcript')) {
      statusCode = 404;
      errorMessage = 'No transcript available (captions may be disabled or video may be private)';
    } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      statusCode = 429;
      errorMessage = 'Rate limited by YouTube - please try again later';
    } else if (error.message?.includes('403') || error.message?.includes('blocked')) {
      statusCode = 403;
      errorMessage = 'Access blocked by YouTube - may need to rotate IP';
    }
    
    res.status(statusCode).json({
      error: errorMessage,
      videoId,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Catch-all for undefined routes
app.all('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available: [
      'GET /health',
      'GET /api/youtube/transcript?videoId=VIDEO_ID'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`YouTube Transcript API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Example: http://localhost:${PORT}/api/youtube/transcript?videoId=dQw4w9WgXcQ`);
});