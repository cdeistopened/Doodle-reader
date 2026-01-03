#!/usr/bin/env node

/**
 * Railway startup script that runs both the static file server 
 * and the YouTube transcript API server on the same port
 */

import express from 'express';
import cors from 'cors';
import { ApifyClient } from 'apify-client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Apify API client
const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

// Apify actor ID for YouTube transcript scraper
const YOUTUBE_TRANSCRIPT_ACTOR = 'insight_api_labs/youtube-transcript';

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

// YouTube transcript API endpoint (using Apify)
app.get('/api/youtube/transcript', async (req, res) => {
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({
      error: 'Missing videoId parameter',
      usage: '/api/youtube/transcript?videoId=VIDEO_ID'
    });
  }
  
  if (!process.env.APIFY_API_TOKEN) {
    return res.status(500).json({
      error: 'Apify API token not configured',
      message: 'Set APIFY_API_TOKEN environment variable'
    });
  }
  
  console.log(`[YouTube API] Fetching transcript via Apify for video: ${videoId}`);
  
  try {
    // Run Apify YouTube transcript scraper
    const input = {
      video_urls: [`https://youtube.com/watch?v=${videoId}`],
      language: 'en',
    };
    
    console.log('[YouTube API] Starting Apify actor run...');
    const run = await apifyClient.actor(YOUTUBE_TRANSCRIPT_ACTOR).call(input);
    
    if (!run || !run.defaultDatasetId) {
      throw new Error('Apify actor run failed - no dataset returned');
    }
    
    // Get results from the dataset
    console.log('[YouTube API] Fetching results from Apify dataset...');
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    
    if (!items || items.length === 0) {
      console.log(`[YouTube API] No transcript data returned from Apify for ${videoId}`);
      return res.status(404).json({
        error: 'No transcript found',
        videoId,
        message: 'This video may not have captions enabled, may be private, or Apify couldn\'t extract the transcript'
      });
    }
    
    const result = items[0];
    console.log('[YouTube API] Apify result structure:', Object.keys(result));
    
    // Handle different possible response formats from Apify
    let transcript = null;
    let segments = [];
    
    if (result.transcript) {
      transcript = result.transcript;
      segments = result.segments || [];
    } else if (result.subtitles) {
      transcript = result.subtitles;
    } else if (result.text) {
      transcript = result.text;
    } else if (Array.isArray(result.items)) {
      // If it's an array of transcript segments
      transcript = result.items.map(item => item.text || item).join(' ');
      segments = result.items;
    }
    
    if (!transcript || transcript.trim().length < 10) {
      console.log(`[YouTube API] Transcript too short or empty from Apify for ${videoId}`);
      return res.status(404).json({
        error: 'No usable transcript found',
        videoId,
        message: 'Apify returned data but transcript was empty or too short'
      });
    }
    
    // Clean up transcript
    const cleanTranscript = transcript
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`[YouTube API] Apify success: ${cleanTranscript.length} chars, ${segments.length} segments`);
    
    res.json({
      success: true,
      videoId,
      transcript: cleanTranscript,
      metadata: {
        length: cleanTranscript.length,
        segments: segments.length,
        source: 'apify',
        actor: YOUTUBE_TRANSCRIPT_ACTOR,
        runId: run.id
      }
    });
    
  } catch (error) {
    console.error(`[YouTube API] Apify error for ${videoId}:`, error.message);
    
    let statusCode = 500;
    let errorMessage = error.message || 'Failed to fetch transcript via Apify';
    
    // Handle specific Apify errors
    if (error.message?.includes('timeout') || error.message?.includes('time limit')) {
      statusCode = 504;
      errorMessage = 'Apify scraping timeout - try again later';
    } else if (error.message?.includes('credit') || error.message?.includes('quota')) {
      statusCode = 429;
      errorMessage = 'Apify quota exceeded - check your billing';
    } else if (error.message?.includes('not found') || error.message?.includes('404')) {
      statusCode = 404;
      errorMessage = 'Video not found or private';
    } else if (error.message?.includes('rent a paid Actor')) {
      statusCode = 402;
      errorMessage = 'Apify actor requires payment - please activate subscription';
    }
    
    res.status(statusCode).json({
      error: errorMessage,
      videoId,
      service: 'apify',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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