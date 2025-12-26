#!/usr/bin/env node
/**
 * Quick Gemini Transcription Test
 * 
 * Tests Gemini speech-to-text with a short audio sample.
 * Uses inline base64 for small files (under 20MB).
 * 
 * Usage:
 *   node test-gemini-quick.js <audio-url>
 *   node test-gemini-quick.js  # uses a default short sample
 */

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
      if (key.startsWith('VITE_')) {
        process.env[key.replace('VITE_', '')] = value;
      }
      process.env[key.trim()] = value;
    }
  });
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url.substring(0, 80)}...`);
    const client = url.startsWith('https') ? https : http;
    
    const request = (url) => {
      client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location);
        }
        
        const chunks = [];
        let downloaded = 0;
        const totalSize = parseInt(res.headers['content-length'] || '0', 10);
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
          downloaded += chunk.length;
          if (totalSize > 0) {
            process.stdout.write(`\rProgress: ${((downloaded / totalSize) * 100).toFixed(0)}%`);
          }
        });
        
        res.on('end', () => {
          console.log(' Done!');
          resolve(Buffer.concat(chunks));
        });
        res.on('error', reject);
      }).on('error', reject);
    };
    
    request(url);
  });
}

async function transcribeWithGemini(audioBuffer, mimeType = 'audio/mpeg') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set. Check your .env file.');
  }
  
  console.log('\nSending to Gemini for transcription...');
  console.log(`Audio size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  
  const audioBase64 = audioBuffer.toString('base64');
  
  const prompt = `Please transcribe this audio completely.

Instructions:
1. Use speaker diarization to identify different speakers.
2. Provide timestamps in [MM:SS] format for every speaker change.
3. If you can infer the speaker's name from context, use it. Otherwise, use Speaker 1, Speaker 2, etc.
4. Output the result in a clean transcript format.
5. Do NOT summarize - transcribe completely.

Format each speaker turn as:
**Speaker Name** [MM:SS]: Their words here.`;

  const startTime = Date.now();
  
  // Using REST API directly for more control
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
        },
      }),
    }
  );
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${err.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`Transcription complete in ${elapsed}s`);
  
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.log('Raw response:', JSON.stringify(data, null, 2));
    throw new Error('No text in response');
  }
  
  return { text, elapsed };
}

async function main() {
  const audioUrl = process.argv[2];
  
  if (!audioUrl) {
    console.log(`
Quick Gemini Transcription Test

Usage:
  node test-gemini-quick.js <audio-url>

Example:
  node test-gemini-quick.js "https://example.com/short-clip.mp3"

Note: For best results, use audio files under 20MB.
`);
    process.exit(1);
  }
  
  try {
    const audioBuffer = await downloadToBuffer(audioUrl);
    const { text, elapsed } = await transcribeWithGemini(audioBuffer);
    
    console.log('\n' + '='.repeat(60));
    console.log('TRANSCRIPTION RESULT');
    console.log('='.repeat(60) + '\n');
    console.log(text);
    
    // Save to file
    const outputPath = path.join(__dirname, 'outputs', `gemini-test-${Date.now()}.md`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `# Gemini Transcription Test\n\n**Processing time:** ${elapsed}s\n\n---\n\n${text}`);
    console.log(`\nSaved to: ${outputPath}`);
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
