#!/usr/bin/env node

import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Try different actors
const actors = [
  'scrape-creators/best-youtube-transcripts-scraper',  // Free option
  'topaz_sharingan/youtube-transcript-scraper-1',       // YouTube Transcript Ninja
  'starvibe/youtube-video-transcript',                  // With metadata
  'insight_api_labs/youtube-transcript'                 // Original
];

async function testApify() {
  console.log('Testing Apify YouTube transcript actor...\n');
  
  const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
  });

  // Try different URL formats
  const urlFormats = [
    'https://www.youtube.com/watch?v=LphE5N1NqLU',
    'https://youtube.com/watch?v=LphE5N1NqLU',
    'http://www.youtube.com/watch?v=LphE5N1NqLU',
    'www.youtube.com/watch?v=LphE5N1NqLU',
    'youtube.com/watch?v=LphE5N1NqLU',
    'LphE5N1NqLU'  // Just the video ID
  ];
  
  console.log('Token:', process.env.APIFY_API_TOKEN ? 'Found' : 'Missing');
  
  // Test the most standard URL format with each actor
  const testUrl = 'https://www.youtube.com/watch?v=LphE5N1NqLU';
  
  for (const actorId of actors) {
    console.log(`\n=== Testing Actor: ${actorId} ===`);
    
    // Try input formats based on error messages from each actor
    const inputFormats = [
      { videoUrls: [testUrl] },                    // scrape-creators wants this
      { startUrls: [{ url: testUrl }] },           // topaz_sharingan wants this (Apify crawler format)
      { startUrls: [testUrl] },                    // alternative startUrls format
      { video_urls: [testUrl], language: 'en' },   // insight_api_labs
      { videoUrl: testUrl },                       // singular form
    ];
    
    for (const input of inputFormats) {
      console.log('\nInput:', JSON.stringify(input, null, 2));
      
      try {
        const run = await apifyClient.actor(actorId).call(input);
      
        if (run?.defaultDatasetId) {
          console.log('✅ Actor run succeeded! Run ID:', run.id);
          
          // Get results
          const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
          
          if (items?.length > 0) {
            console.log('Result keys:', Object.keys(items[0]));
            console.log('First 200 chars of transcript:', 
              JSON.stringify(items[0]).substring(0, 200) + '...');
            console.log('\n🎉 WORKING CONFIGURATION:');
            console.log(`Actor: ${actorId}`);
            console.log(`Input format: ${JSON.stringify(input)}`);
            return; // Exit on success
          } else {
            console.log('❌ No items returned');
          }
        } else {
          console.log('❌ No dataset returned');
        }
      } catch (error) {
        console.log('❌ Error:', error.message?.substring(0, 100));
      }
    }
  }
}

// Run the test
testApify().catch(console.error);