#!/usr/bin/env node

/**
 * PDF OCR CLI Tool
 *
 * Automatically chunks large PDFs and processes them through Gemini 3 Flash
 * to produce clean, formatted Markdown output.
 *
 * Usage:
 *   node pdf-ocr.js <pdf-file-or-folder> [options]
 *
 * Options:
 *   --output, -o <dir>    Output directory (default: ./content/pdfs)
 *   --prompt, -p <file>   Custom prompt file (optional)
 *   --latin               Use Latin diacritical restoration mode
 *   --verbose, -v         Show detailed progress
 *
 * Examples:
 *   node pdf-ocr.js document.pdf
 *   node pdf-ocr.js ./pdfs-folder --output ./output
 *   node pdf-ocr.js medieval-text.pdf --latin
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

const GEMINI_MODEL = 'gemini-3-flash-preview';
const MAX_PAGES_PER_CHUNK = 6;
const MAX_OUTPUT_TOKENS = 64000;

// Default prompt for general documents
const DEFAULT_PROMPT = `Convert this PDF document to clean Markdown.

Please ensure the following:
- Hierarchical Headers: Use appropriate ## and ### tags for titles and sub-sections
- Styling: Maintain all original italics, bold text, and blockquotes
- Tables: Convert to Markdown table format if present
- Footnotes: Format using [^1] notation with definitions at the end
- Structure: Preserve paragraph structure and document flow
- Exclusions: Do not include page numbers or recurring headers/footers
- Clean Output: No code blocks wrapping the content, no commentary

Output clean, readable Markdown.`;

// Prompt for Latin/Medieval manuscripts
const LATIN_PROMPT = `You are an expert in Medieval Latin manuscripts and 19th-century scholarly editions.

Extract the complete text from this PDF.

## Instructions:

1. **Two-column layout**: Read each column top-to-bottom, left column first, then right column. Do NOT merge columns horizontally.

2. **Diacriticals**: Restore classical Latin diacriticals:
   - Use æ (not ae) for the ligature
   - Use œ (not oe) for the ligature
   - Preserve any accents present in the original

3. **Structure**:
   - Use ## (h2) for all chapter headings (CAP. I, CAP. II, etc.)
   - Use ### (h3) for section titles within chapters
   - Format chapters as: ## CAP. I. — DE TRITICO

4. **Footnotes**: Convert in-text footnote numbers from (1), (2) format to Markdown format [^1], [^2]. Place footnote definitions at the end.

5. **Column markers**: Note column numbers as comments: <!-- col. 1125 -->

Output clean, readable Markdown with the full Latin text.`;

// ============================================================================
// Utility Functions
// ============================================================================

function log(msg, verbose = false) {
  if (!verbose || process.argv.includes('-v') || process.argv.includes('--verbose')) {
    console.log(msg);
  }
}

function loadApiKey() {
  // Try environment variable first
  let apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Try .env file in current directory
    const envPaths = [
      '.env',
      path.join(process.cwd(), '.env'),
      path.join(path.dirname(new URL(import.meta.url).pathname), '.env'),
    ];

    for (const envPath of envPaths) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/VITE_GEMINI_API_KEY=(.+)/);
        if (match && match[1]) {
          apiKey = match[1].trim();
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }
  }

  if (!apiKey) {
    console.error('❌ No Gemini API key found.');
    console.error('   Set VITE_GEMINI_API_KEY in your environment or .env file');
    process.exit(1);
  }

  return apiKey;
}

function getPdfPageCount(pdfPath) {
  try {
    const result = execSync(`qpdf --show-npages "${pdfPath}" 2>/dev/null`, { encoding: 'utf8' });
    return parseInt(result.trim(), 10);
  } catch (e) {
    // Fallback: try using pdfinfo if available
    try {
      const result = execSync(`pdfinfo "${pdfPath}" 2>/dev/null | grep Pages`, { encoding: 'utf8' });
      const match = result.match(/Pages:\s+(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    } catch (e2) {
      return null;
    }
  }
}

function extractPdfPages(pdfPath, startPage, endPage, outputPath) {
  try {
    execSync(`qpdf "${pdfPath}" --pages . ${startPage}-${endPage} -- "${outputPath}" 2>/dev/null`);
    return true;
  } catch (e) {
    // qpdf may exit with code 3 for warnings but still succeed
    return fs.existsSync(outputPath);
  }
}

function pdfToBase64(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  return buffer.toString('base64');
}

// ============================================================================
// Gemini API
// ============================================================================

async function callGemini(apiKey, pdfBase64, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No content returned from Gemini');
  }

  return cleanOutput(text);
}

function cleanOutput(text) {
  let cleaned = text.trim();

  // Remove markdown code block wrappers if present
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.slice(11).trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3).trim();
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3).trim();
  }

  return cleaned;
}

// ============================================================================
// Chunking Strategy
// ============================================================================

function calculateChunks(totalPages, skipFrontMatter = 0) {
  const startPage = skipFrontMatter + 1;
  const chunks = [];

  let currentStart = startPage;
  while (currentStart <= totalPages) {
    const currentEnd = Math.min(currentStart + MAX_PAGES_PER_CHUNK - 1, totalPages);
    chunks.push({ start: currentStart, end: currentEnd });
    currentStart = currentEnd + 1;
  }

  return chunks;
}

// ============================================================================
// PDF Analysis (optional pre-flight)
// ============================================================================

async function analyzePdf(apiKey, pdfPath) {
  // Extract first 2 pages for analysis
  const tempPath = `/tmp/pdf-analyze-${Date.now()}.pdf`;
  extractPdfPages(pdfPath, 1, 2, tempPath);

  const pdfBase64 = pdfToBase64(tempPath);

  const analysisPrompt = `Analyze this PDF and provide a brief JSON response with:
{
  "documentType": "book|article|manuscript|newsletter|other",
  "language": "english|latin|german|mixed|other",
  "hasColumns": true/false,
  "hasTwoColumnLayout": true/false,
  "hasFootnotes": true/false,
  "hasTableOfContents": true/false,
  "frontMatterPages": number (pages to skip before main content),
  "estimatedChapters": number or null,
  "specialFeatures": ["list", "of", "features"]
}

Only return valid JSON, no other text.`;

  try {
    const result = await callGemini(apiKey, pdfBase64, analysisPrompt);
    fs.unlinkSync(tempPath);

    // Parse JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Analysis failed, return defaults
  }

  try { fs.unlinkSync(tempPath); } catch (e) {}

  return {
    documentType: 'other',
    language: 'english',
    hasColumns: false,
    hasTwoColumnLayout: false,
    hasFootnotes: false,
    frontMatterPages: 0,
  };
}

// ============================================================================
// Main Processing
// ============================================================================

async function processPdf(pdfPath, options = {}) {
  const apiKey = loadApiKey();
  const fileName = path.basename(pdfPath, '.pdf');
  const outputDir = options.outputDir || path.join(process.cwd(), 'content', 'pdfs');

  log(`\n📄 Processing: ${fileName}`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get page count
  const totalPages = getPdfPageCount(pdfPath);
  if (!totalPages) {
    console.error(`❌ Could not determine page count for ${pdfPath}`);
    console.error('   Make sure qpdf is installed: brew install qpdf');
    return null;
  }

  log(`   📊 ${totalPages} pages detected`);

  // Determine prompt
  let prompt = options.prompt || DEFAULT_PROMPT;
  if (options.latin) {
    prompt = LATIN_PROMPT;
    log('   🔤 Using Latin diacritical mode');
  }

  // Analyze if it's a large document
  let skipPages = 0;
  if (totalPages > 20 && !options.skipAnalysis) {
    log('   🔍 Analyzing document structure...');
    const analysis = await analyzePdf(apiKey, pdfPath);
    skipPages = analysis.frontMatterPages || 0;

    if (analysis.language === 'latin' && !options.latin) {
      log('   🔤 Latin detected - switching to Latin mode');
      prompt = LATIN_PROMPT;
    }

    if (skipPages > 0) {
      log(`   ⏭️  Skipping ${skipPages} front matter pages`);
    }
  }

  // Calculate chunks
  const chunks = calculateChunks(totalPages, skipPages);
  log(`   📦 Processing in ${chunks.length} chunk(s)`);

  // Process chunks
  const tempDir = `/tmp/pdf-ocr-${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkNum = i + 1;

    log(`   ⚙️  Chunk ${chunkNum}/${chunks.length} (pages ${chunk.start}-${chunk.end})...`);

    // Extract chunk
    const chunkPath = path.join(tempDir, `chunk-${chunkNum}.pdf`);
    if (!extractPdfPages(pdfPath, chunk.start, chunk.end, chunkPath)) {
      console.error(`   ❌ Failed to extract pages ${chunk.start}-${chunk.end}`);
      continue;
    }

    // Process chunk
    const pdfBase64 = pdfToBase64(chunkPath);

    try {
      const result = await callGemini(apiKey, pdfBase64, prompt);
      results.push(result);
      log(`   ✅ Chunk ${chunkNum} complete (${result.length} chars)`);
    } catch (e) {
      console.error(`   ❌ Chunk ${chunkNum} failed: ${e.message}`);
    }

    // Clean up chunk file
    try { fs.unlinkSync(chunkPath); } catch (e) {}
  }

  // Clean up temp directory
  try { fs.rmdirSync(tempDir); } catch (e) {}

  if (results.length === 0) {
    console.error(`❌ No chunks processed successfully for ${fileName}`);
    return null;
  }

  // Combine results
  const combined = results.join('\n\n');

  // Write output
  const outputPath = path.join(outputDir, `${fileName}.md`);
  fs.writeFileSync(outputPath, combined);

  log(`   💾 Saved: ${outputPath}`);
  log(`   📝 ${combined.length.toLocaleString()} characters, ${combined.split('\n').length.toLocaleString()} lines`);

  return outputPath;
}

async function processFolder(folderPath, options = {}) {
  const files = fs.readdirSync(folderPath)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(folderPath, f));

  if (files.length === 0) {
    console.error(`❌ No PDF files found in ${folderPath}`);
    return [];
  }

  log(`\n📁 Found ${files.length} PDF(s) in folder\n`);

  const results = [];
  for (const file of files) {
    const result = await processPdf(file, options);
    if (result) results.push(result);
  }

  return results;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
PDF OCR Tool - Convert PDFs to Markdown via Gemini

Usage:
  node pdf-ocr.js <pdf-file-or-folder> [options]

Options:
  --output, -o <dir>    Output directory (default: ./content/pdfs)
  --latin               Use Latin diacritical restoration mode
  --verbose, -v         Show detailed progress
  --help, -h            Show this help

Examples:
  node pdf-ocr.js document.pdf
  node pdf-ocr.js ./pdfs-folder --output ./output
  node pdf-ocr.js medieval-text.pdf --latin
`);
    process.exit(0);
  }

  // Parse arguments
  const inputPath = args[0];
  const options = {
    outputDir: null,
    latin: args.includes('--latin'),
    verbose: args.includes('-v') || args.includes('--verbose'),
  };

  // Parse output directory
  const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    options.outputDir = args[outputIdx + 1];
  }

  // Check if input exists
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File or folder not found: ${inputPath}`);
    process.exit(1);
  }

  // Check for qpdf
  try {
    execSync('which qpdf', { encoding: 'utf8' });
  } catch (e) {
    console.error('❌ qpdf is required but not installed.');
    console.error('   Install with: brew install qpdf');
    process.exit(1);
  }

  const startTime = Date.now();

  // Process based on input type
  const stats = fs.statSync(inputPath);
  let results;

  if (stats.isDirectory()) {
    results = await processFolder(inputPath, options);
  } else if (stats.isFile() && inputPath.toLowerCase().endsWith('.pdf')) {
    const result = await processPdf(inputPath, options);
    results = result ? [result] : [];
  } else {
    console.error(`❌ Invalid input: ${inputPath}`);
    console.error('   Provide a PDF file or a folder containing PDFs');
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✨ Done! Processed ${results.length} file(s) in ${elapsed}s`);
  if (results.length > 0) {
    console.log(`   Output: ${path.dirname(results[0])}/`);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
