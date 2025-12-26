#!/usr/bin/env node
/**
 * Transcription Comparison Sandbox
 * 
 * Tests Gemini speech-to-text with diarization against AssemblyAI.
 * 
 * Usage:
 *   node transcribe-compare.js <rss-url> [episode-index]
 *   node transcribe-compare.js <audio-url>
 * 
 * Examples:
 *   node transcribe-compare.js "https://feeds.example.com/podcast.xml" 0
 *   node transcribe-compare.js "https://example.com/episode.mp3"
 * 
 * Environment:
 *   GEMINI_API_KEY - Google Gemini API key
 *   ASSEMBLYAI_API_KEY - AssemblyAI API key (optional, for comparison)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from parent directory
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      const value = valueParts.join('=').trim();
      // Map VITE_ prefixed keys to non-prefixed versions
      if (key.startsWith('VITE_')) {
        process.env[key.replace('VITE_', '')] = value;
      }
      process.env[key.trim()] = value;
    }
  });
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// ============================================================================
// RSS Parsing
// ============================================================================

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseRssFeed(xml) {
  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  
  for (const match of itemMatches) {
    const itemXml = match[1];
    
    const title = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || 'Untitled';
    const enclosure = itemXml.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
    const duration = itemXml.match(/<itunes:duration>([^<]+)<\/itunes:duration>/i)?.[1];
    
    if (enclosure) {
      items.push({
        title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
        audioUrl: enclosure[1],
        duration: duration || 'unknown'
      });
    }
  }
  
  return items;
}

// ============================================================================
// File Download
// ============================================================================

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading: ${url.substring(0, 80)}...`);
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;
    
    const request = (url) => {
      client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location);
        }
        
        const totalSize = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (totalSize > 0) {
            const pct = ((downloaded / totalSize) * 100).toFixed(1);
            process.stdout.write(`\r  Progress: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          }
        });
        
        res.pipe(file);
        file.on('finish', () => {
          console.log('\n  Download complete.');
          file.close();
          resolve(destPath);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };
    
    request(url);
  });
}

// ============================================================================
// Gemini Transcription (with File API for large files)
// ============================================================================

async function transcribeWithGemini(audioPath, title) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set');
  }
  
  console.log('\n=== GEMINI TRANSCRIPTION ===');
  console.log('  Uploading to Gemini Files API...');
  
  const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  
  // Upload file
  const uploadResult = await fileManager.uploadFile(audioPath, {
    mimeType: 'audio/mpeg',
    displayName: path.basename(audioPath),
  });
  
  console.log(`  File uploaded: ${uploadResult.file.name}`);
  console.log(`  State: ${uploadResult.file.state}`);
  
  // Wait for file to be processed
  let file = uploadResult.file;
  while (file.state === 'PROCESSING') {
    console.log('  Waiting for file processing...');
    await new Promise(r => setTimeout(r, 5000));
    file = await fileManager.getFile(file.name);
  }
  
  if (file.state === 'FAILED') {
    throw new Error('File processing failed');
  }
  
  console.log('  File ready. Requesting transcription with diarization...');
  
  // Use Gemini 1.5 Pro for best accuracy (as recommended)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  
  const prompt = `Please transcribe the attached audio.

${title ? `This is a podcast episode titled: "${title}"` : ''}

Instructions:
1. Use speaker diarization to identify different speakers.
2. Provide timestamps in [MM:SS] format for every speaker change.
3. If you can infer the speaker's name from context (introductions, how they address each other), use it. Otherwise, use Speaker 1, Speaker 2, etc.
4. Output the result in a clean transcript format.
5. Preserve technical terms and proper nouns accurately.
6. Do NOT summarize - transcribe completely.

Format each speaker turn as:
**Speaker Name** [MM:SS]: Their words here.`;

  const startTime = Date.now();
  
  const result = await model.generateContent([
    {
      fileData: {
        mimeType: file.mimeType,
        fileUri: file.uri,
      },
    },
    { text: prompt },
  ]);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Transcription complete in ${elapsed}s`);
  
  // Clean up uploaded file
  try {
    await fileManager.deleteFile(file.name);
    console.log('  Uploaded file deleted.');
  } catch (e) {
    // Ignore cleanup errors
  }
  
  return {
    provider: 'gemini',
    model: 'gemini-1.5-pro',
    content: result.response.text(),
    elapsedSeconds: parseFloat(elapsed),
  };
}

// ============================================================================
// AssemblyAI Transcription
// ============================================================================

async function transcribeWithAssemblyAI(audioUrl, title) {
  if (!ASSEMBLYAI_API_KEY) {
    console.log('\n=== ASSEMBLYAI TRANSCRIPTION ===');
    console.log('  Skipped (ASSEMBLYAI_API_KEY not set)');
    return null;
  }
  
  console.log('\n=== ASSEMBLYAI TRANSCRIPTION ===');
  console.log('  Starting transcription job...');
  
  const startTime = Date.now();
  
  // Start transcription
  const startResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'Authorization': ASSEMBLYAI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
  });
  
  if (!startResponse.ok) {
    const err = await startResponse.json().catch(() => ({}));
    throw new Error(`AssemblyAI error: ${err.error || startResponse.statusText}`);
  }
  
  const { id: transcriptId } = await startResponse.json();
  console.log(`  Job ID: ${transcriptId}`);
  
  // Poll for completion
  let status = 'queued';
  let data = null;
  
  while (status !== 'completed' && status !== 'error') {
    await new Promise(r => setTimeout(r, 3000));
    
    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 'Authorization': ASSEMBLYAI_API_KEY },
    });
    
    data = await pollResponse.json();
    status = data.status;
    process.stdout.write(`\r  Status: ${status}...`);
  }
  
  console.log('');
  
  if (status === 'error') {
    throw new Error(`AssemblyAI transcription failed: ${data.error}`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Transcription complete in ${elapsed}s`);
  
  // Format output
  let content = '## Transcript\n\n';
  if (data.utterances && data.utterances.length > 0) {
    for (const u of data.utterances) {
      const mins = Math.floor(u.start / 60000);
      const secs = Math.floor((u.start % 60000) / 1000);
      const timestamp = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      content += `**Speaker ${u.speaker}** [${timestamp}]: ${u.text}\n\n`;
    }
  } else {
    content += data.text;
  }
  
  return {
    provider: 'assemblyai',
    model: 'default',
    content,
    elapsedSeconds: parseFloat(elapsed),
    speakerCount: data.utterances ? new Set(data.utterances.map(u => u.speaker)).size : 1,
    durationSeconds: data.audio_duration,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Transcription Comparison Sandbox

Usage:
  node transcribe-compare.js <rss-url> [episode-index]
  node transcribe-compare.js <audio-url>

Examples:
  node transcribe-compare.js "https://feeds.example.com/podcast.xml" 0
  node transcribe-compare.js "https://example.com/episode.mp3"

Environment variables (loaded from ../.env):
  GEMINI_API_KEY (or VITE_GEMINI_API_KEY)
  ASSEMBLYAI_API_KEY (or VITE_ASSEMBLYAI_API_KEY) - optional for comparison
`);
    process.exit(1);
  }
  
  const input = args[0];
  const episodeIndex = parseInt(args[1] || '0', 10);
  
  let audioUrl;
  let title = 'Unknown Episode';
  
  // Determine if input is RSS feed or direct audio URL
  if (input.includes('.xml') || input.includes('/feed') || input.includes('rss')) {
    console.log('Fetching RSS feed...');
    const feedXml = await fetchUrl(input);
    const episodes = parseRssFeed(feedXml);
    
    if (episodes.length === 0) {
      console.error('No episodes found in feed');
      process.exit(1);
    }
    
    console.log(`\nFound ${episodes.length} episodes:`);
    episodes.slice(0, 5).forEach((ep, i) => {
      console.log(`  [${i}] ${ep.title} (${ep.duration})`);
    });
    if (episodes.length > 5) {
      console.log(`  ... and ${episodes.length - 5} more`);
    }
    
    const episode = episodes[episodeIndex];
    if (!episode) {
      console.error(`Episode index ${episodeIndex} not found`);
      process.exit(1);
    }
    
    console.log(`\nSelected: ${episode.title}`);
    audioUrl = episode.audioUrl;
    title = episode.title;
  } else {
    audioUrl = input;
    console.log(`Direct audio URL: ${audioUrl}`);
  }
  
  // Create output directory
  const outputDir = path.join(__dirname, 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Download audio file for Gemini (it needs local file for Files API)
  const audioFilename = `audio_${Date.now()}.mp3`;
  const audioPath = path.join(outputDir, audioFilename);
  
  console.log('\nDownloading audio file...');
  await downloadFile(audioUrl, audioPath);
  
  const fileSize = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(1);
  console.log(`  File size: ${fileSize} MB`);
  
  // Run both transcriptions
  const results = [];
  
  try {
    const geminiResult = await transcribeWithGemini(audioPath, title);
    results.push(geminiResult);
  } catch (err) {
    console.error(`  Gemini error: ${err.message}`);
  }
  
  try {
    const assemblyResult = await transcribeWithAssemblyAI(audioUrl, title);
    if (assemblyResult) results.push(assemblyResult);
  } catch (err) {
    console.error(`  AssemblyAI error: ${err.message}`);
  }
  
  // Save outputs
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
  
  for (const result of results) {
    const filename = `${timestamp}_${safeTitle}_${result.provider}.md`;
    const filepath = path.join(outputDir, filename);
    
    const header = `# ${title}

**Provider:** ${result.provider}
**Model:** ${result.model}
**Processing time:** ${result.elapsedSeconds}s
${result.durationSeconds ? `**Audio duration:** ${Math.round(result.durationSeconds / 60)} minutes` : ''}
${result.speakerCount ? `**Speakers detected:** ${result.speakerCount}` : ''}

---

`;
    
    fs.writeFileSync(filepath, header + result.content);
    console.log(`\nSaved: ${filename}`);
  }
  
  // Cleanup audio file
  fs.unlinkSync(audioPath);
  console.log('\nAudio file cleaned up.');
  
  // Summary
  console.log('\n=== SUMMARY ===');
  for (const result of results) {
    console.log(`${result.provider}: ${result.elapsedSeconds}s processing time`);
  }
  console.log(`\nOutputs saved to: ${outputDir}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
