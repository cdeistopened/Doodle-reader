/**
 * Doodle Reader - PDF OCR Service
 *
 * Uses Gemini 3 for PDF-to-Markdown conversion.
 * Handles chunking for large PDFs to stay within API limits.
 * Uses heuristic-based analysis for cost estimation.
 */

import { PDFDocument } from 'pdf-lib';

// Gemini 3 Flash - fast and reliable for PDF OCR
const GEMINI_MODEL = 'gemini-3-flash-preview';

// Gemini API limits
const MAX_REQUEST_SIZE_MB = 20;
const MAX_OUTPUT_TOKENS = 64000;

// Based on testing: ~500-1000 tokens/page for dense content
// Large PDFs can have heavy images - use smaller chunks for reliability
// 20 pages keeps chunk size manageable for scanned documents
const PAGES_PER_CHUNK = 20;

const OCR_PROMPT = `Convert this PDF document to clean Markdown.

Stop the transcription immediately before any section titled "NOTES FROM THE ASSOCIATIONS" or similar association notes. Do not include that section or anything that follows it.

Please ensure the following:
- Hierarchical Headers: Use appropriate H# tags for titles and sub-sections
- Styling: Maintain all original italics, bold text, and blockquotes
- Images: If you encounter an image, note the PDF page number and provide a brief description of what is shown
- Exclusions: Do not include page numbers or recurring headers/footers (e.g., "The Cross & the Plough V. 2 No. 4")
- Tables: Convert to Markdown table format if present
- Footnotes: Format using [^1] notation
- Structure: Preserve paragraph structure and document flow
- Formatting: Ensure a clean, professional markdown layout throughout

Do NOT wrap output in code blocks. Do NOT add commentary, just the converted text.`;

const OCR_CHUNK_PROMPT = (chunkNum: number, totalChunks: number) => `Convert this PDF section to clean Markdown.

This is part ${chunkNum} of ${totalChunks} from a larger document.

Stop the transcription immediately before any section titled "NOTES FROM THE ASSOCIATIONS" or similar association notes. Do not include that section or anything that follows it.

Please ensure the following:
- Hierarchical Headers: Use appropriate H# tags for titles and sub-sections
- Styling: Maintain all original italics, bold text, and blockquotes
- Images: If you encounter an image, note the PDF page number and provide a brief description of what is shown
- Exclusions: Do not include page numbers or recurring headers/footers (e.g., "The Cross & the Plough V. 2 No. 4")
- Tables: Convert to Markdown table format if present
- Footnotes: Format using [^1] notation
- Structure: Preserve paragraph structure and document flow
- Formatting: Ensure a clean, professional markdown layout throughout

Do NOT wrap output in code blocks. Do NOT add commentary, just the converted text.

If this is not the first chunk, continue from where the previous section ended.`;

export interface ChunkResult {
  chunkNumber: number;
  totalChunks: number;
  startPage: number;
  endPage: number;
  content: string;
  processingTimeMs: number;
}

export interface OCRProgress {
  status: 'reading' | 'analyzing' | 'processing' | 'completed' | 'error';
  message: string;
  currentPage?: number;
  totalPages?: number;
  currentChunk?: number;
  totalChunks?: number;
  currentFile?: string;
  totalFiles?: number;
  // New: completed chunks available for immediate use
  completedChunks?: ChunkResult[];
  // New: partial content so far (concatenated completed chunks)
  partialContent?: string;
}

export interface DocumentAnalysis {
  pageCount: number;
  estimatedTokens: number;
  contentType: 'text' | 'mixed' | 'image-heavy';
  quality: 'high' | 'medium' | 'low';
  language: 'english' | 'latin' | 'mixed' | 'other';
  isScholarly: boolean;
  structure: {
    hasTables: boolean;
    hasImages: boolean;
    hasColumns: boolean;
    hasFootnotes: boolean;
    headings: string[];
  };
  costEstimate: {
    tokens: number;
    cost: number;
    chunks: number;
    processingTime: number;
  };
  recommendedChunkSize: number;
}

export interface OCRResult {
  content: string;
  pageCount: number;
  fileSizeMB: number;
  chunksUsed: number;
  processingTimeMs: number;
  analysis?: DocumentAnalysis;
}

type ProgressCallback = (progress: OCRProgress) => void;

/**
 * Get Gemini API key from environment or localStorage
 */
function getGeminiApiKey(): string | null {
  // @ts-ignore - Vite env
  if (import.meta.env?.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  const stored = localStorage.getItem('gemini_api_key');
  if (stored) return stored;
  return null;
}

/**
 * Check if Gemini API key is available
 */
export function hasGeminiKey(): boolean {
  return !!getGeminiApiKey();
}

/**
 * Extract a range of pages from a PDF
 */
async function extractPageRange(
  pdfBytes: Uint8Array,
  startPage: number,
  endPage: number
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();

  const pageIndices: number[] = [];
  for (let i = startPage; i <= endPage && i < srcDoc.getPageCount(); i++) {
    pageIndices.push(i);
  }

  const pages = await newDoc.copyPages(srcDoc, pageIndices);
  pages.forEach(page => newDoc.addPage(page));

  return newDoc.save();
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Call Gemini API for OCR with retry logic
 */
async function callGeminiOCR(
  apiKey: string,
  pdfBase64: string,
  prompt: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: 'application/pdf',
                      data: pdfBase64,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 1.0,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              thinkingConfig: {
                thinkingLevel: 'low',
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        const errorMsg = err.error?.message || `Gemini API Error: ${response.status}`;

        // Check if it's a retryable error (500, 503, rate limit)
        if (response.status >= 500 || response.status === 429) {
          console.warn(`[OCR] Attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
          lastError = new Error(errorMsg);

          if (attempt < maxRetries) {
            // Exponential backoff: 2s, 4s, 8s
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`[OCR] Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        throw new Error(errorMsg);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('No content returned from Gemini');
      }

      return cleanLLMOutput(text);
    } catch (error: any) {
      lastError = error;

      // Only retry on network errors or server errors
      if (attempt < maxRetries && (error.message?.includes('fetch') || error.message?.includes('500'))) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[OCR] Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        console.log(`[OCR] Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * Clean up LLM output (remove code block wrappers)
 */
function cleanLLMOutput(text: string): string {
  let cleaned = text.trim();

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

/**
 * Process a PDF file and convert to Markdown using Gemini OCR
 * Enhanced with document analysis and optimized processing
 */
export async function processPDF(
  file: File,
  onProgress?: ProgressCallback,
  includeAnalysis: boolean = true
): Promise<OCRResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env');
  }

  const startTime = Date.now();

  const report = (
    status: OCRProgress['status'],
    message: string,
    extra?: Partial<OCRProgress>
  ) => {
    onProgress?.({ status, message, ...extra });
  };

  report('reading', 'Reading PDF file...');

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  const fileSizeMB = pdfBytes.length / (1024 * 1024);

  // Load PDF to get page count
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  report('reading', `PDF loaded: ${totalPages} pages, ${fileSizeMB.toFixed(1)} MB`, {
    totalPages,
  });

  // Perform document analysis if requested
  let analysis: DocumentAnalysis | undefined;
  if (includeAnalysis) {
    analysis = await analyzeDocument(file, onProgress);
  }

  // Determine chunking strategy
  const pagesPerChunk = analysis?.recommendedChunkSize || PAGES_PER_CHUNK;
  const needsChunking = fileSizeMB > MAX_REQUEST_SIZE_MB || totalPages > pagesPerChunk;
  const numChunks = needsChunking ? Math.ceil(totalPages / pagesPerChunk) : 1;

  console.log(
    `[OCR] Processing: ${totalPages} pages, ${fileSizeMB.toFixed(2)} MB` +
    (needsChunking ? ` (${numChunks} chunks, ${pagesPerChunk} pages/chunk)` : ' (single-shot)') +
    (analysis ? ` -> est. ${analysis.estimatedTokens.toLocaleString()} tokens, $${analysis.costEstimate.cost.toFixed(4)}` : '')
  );

  try {
    let fullContent = '';
    const actualChunksUsed = numChunks;

    if (!needsChunking) {
      // Single-shot processing for smaller documents
      report('processing', 'Processing with Gemini...', {
        currentPage: 1,
        totalPages,
        currentChunk: 1,
        totalChunks: 1,
      });

      const base64Pdf = uint8ArrayToBase64(pdfBytes);
      const prompt = analysis ? createOptimizedPrompt(analysis) : OCR_PROMPT;
      fullContent = await callGeminiOCR(apiKey, base64Pdf, prompt);

      report('processing', 'Processing complete', {
        currentPage: totalPages,
        totalPages,
      });
    } else {
      // Chunked processing for larger documents
      // Track completed chunks for incremental progress reporting
      const completedChunks: ChunkResult[] = [];

      for (let chunk = 0; chunk < numChunks; chunk++) {
        const startPage = chunk * pagesPerChunk;
        const endPage = Math.min(startPage + pagesPerChunk - 1, totalPages - 1);
        const chunkStartTime = Date.now();

        // Report progress with completed chunks so far
        const partialContent = completedChunks.length > 0
          ? completedChunks.map(c => c.content).join('\n\n---\n\n')
          : undefined;

        report('processing', `Processing chunk ${chunk + 1}/${numChunks} (pages ${startPage + 1}-${endPage + 1})...`, {
          currentPage: startPage + 1,
          totalPages,
          currentChunk: chunk + 1,
          totalChunks: numChunks,
          completedChunks: completedChunks.length > 0 ? [...completedChunks] : undefined,
          partialContent,
        });

        console.log(`[OCR] Chunk ${chunk + 1}/${numChunks}: pages ${startPage + 1}-${endPage + 1}`);

        // Extract pages for this chunk
        const chunkPdfBytes = await extractPageRange(pdfBytes, startPage, endPage);
        const chunkBase64 = uint8ArrayToBase64(chunkPdfBytes);

        // Check chunk size
        const chunkSizeMB = chunkPdfBytes.length / (1024 * 1024);
        if (chunkSizeMB > MAX_REQUEST_SIZE_MB) {
          console.warn(`[OCR] Chunk ${chunk + 1} is ${chunkSizeMB.toFixed(2)} MB - may fail`);
        }

        // Process chunk with optimized prompt
        const chunkPrompt = analysis
          ? createOptimizedPrompt(analysis, true, chunk + 1, numChunks)
          : OCR_CHUNK_PROMPT(chunk + 1, numChunks);

        try {
          const chunkContent = await callGeminiOCR(apiKey, chunkBase64, chunkPrompt);
          const chunkProcessingTime = Date.now() - chunkStartTime;

          // Save completed chunk immediately
          const chunkResult: ChunkResult = {
            chunkNumber: chunk + 1,
            totalChunks: numChunks,
            startPage: startPage + 1,
            endPage: endPage + 1,
            content: chunkContent,
            processingTimeMs: chunkProcessingTime,
          };
          completedChunks.push(chunkResult);

          console.log(`[OCR] ✓ Chunk ${chunk + 1}/${numChunks} complete (${chunkContent.length} chars, ${(chunkProcessingTime / 1000).toFixed(1)}s)`);

          // Report chunk completion with updated partial content
          const updatedPartialContent = completedChunks.map(c => c.content).join('\n\n---\n\n');
          report('processing', `Chunk ${chunk + 1}/${numChunks} complete`, {
            currentPage: endPage + 1,
            totalPages,
            currentChunk: chunk + 1,
            totalChunks: numChunks,
            completedChunks: [...completedChunks],
            partialContent: updatedPartialContent,
          });
        } catch (error: any) {
          // On chunk failure, report error but include partial results
          const partialContent = completedChunks.length > 0
            ? completedChunks.map(c => c.content).join('\n\n---\n\n')
            : undefined;

          console.error(`[OCR] ✗ Chunk ${chunk + 1}/${numChunks} failed: ${error.message}`);

          // Re-throw with partial results attached
          const enhancedError = new Error(
            `Chunk ${chunk + 1}/${numChunks} failed: ${error.message}. ` +
            `${completedChunks.length} chunks completed successfully.`
          );
          (enhancedError as any).partialResults = {
            completedChunks,
            partialContent,
            failedAtChunk: chunk + 1,
          };
          throw enhancedError;
        }
      }

      // Combine all chunks
      fullContent = completedChunks.map(c => c.content).join('\n\n---\n\n');
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(
      `[OCR] Completed: ${totalPages} pages, ${fileSizeMB.toFixed(2)} MB, ` +
      `${(processingTimeMs / 1000).toFixed(1)}s` +
      (needsChunking ? `, ${numChunks} chunks` : '')
    );

    report('completed', 'OCR complete!', {
      currentPage: totalPages,
      totalPages,
    });

    return {
      content: fullContent,
      pageCount: totalPages,
      fileSizeMB: Math.round(fileSizeMB * 100) / 100,
      chunksUsed: actualChunksUsed,
      processingTimeMs,
      analysis
    };
  } catch (error: any) {
    report('error', error.message);
    throw error;
  }
}

/**
 * Generate a title from filename
 */
export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyze PDF document using heuristics for cost estimation
 * Actual content detection (Latin, columns, etc.) is done by Gemini during processing
 */
export async function analyzeDocument(
  file: File,
  onProgress?: ProgressCallback
): Promise<DocumentAnalysis> {
  onProgress?.({
    status: 'analyzing',
    message: 'Analyzing document...'
  });

  try {
    // Load PDF to get page count
    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const fileSizeMB = pdfBytes.length / (1024 * 1024);

    // Estimate tokens based on file size and page count
    // Typical PDF: ~500 words/page, ~1.3 tokens/word = ~650 tokens/page
    const estimatedTokensPerPage = 650;
    const totalEstimatedTokens = estimatedTokensPerPage * pageCount;

    // Detect language hints from filename
    const filename = file.name.toLowerCase();
    const latinHints = ['latin', 'medieval', 'aquinas', 'augustine', 'caput', 'liber'];
    const isLikelyLatin = latinHints.some(hint => filename.includes(hint));

    // Detect scholarly hints from filename
    const scholarlyHints = ['thesis', 'dissertation', 'journal', 'academic', 'paper'];
    const isLikelyScholarly = scholarlyHints.some(hint => filename.includes(hint));

    // Use default quality assumption (will be refined by Gemini during processing)
    const quality: DocumentAnalysis['quality'] = 'medium';
    const contentType: DocumentAnalysis['contentType'] = 'text';

    // Calculate cost estimate (Gemini Flash pricing)
    const costPerToken = 0.0001 / 1000; // Gemini Flash is very cheap
    const estimatedCost = totalEstimatedTokens * costPerToken;

    // Estimate processing time
    const baseTimePerPage = 2; // seconds
    const estimatedProcessingTime = pageCount * baseTimePerPage;

    const analysis: DocumentAnalysis = {
      pageCount,
      estimatedTokens: totalEstimatedTokens,
      contentType,
      quality,
      language: isLikelyLatin ? 'latin' : 'english',
      isScholarly: isLikelyScholarly,
      structure: {
        hasTables: false,     // Will be detected by Gemini
        hasImages: false,     // Will be detected by Gemini
        hasColumns: false,    // Will be detected by Gemini
        hasFootnotes: false,  // Will be detected by Gemini
        headings: []
      },
      costEstimate: {
        tokens: totalEstimatedTokens,
        cost: estimatedCost,
        chunks: Math.ceil(pageCount / PAGES_PER_CHUNK),
        processingTime: estimatedProcessingTime
      },
      recommendedChunkSize: PAGES_PER_CHUNK
    };

    console.log(
      `[Analysis] ${file.name}: ${pageCount} pages, ${fileSizeMB.toFixed(1)} MB, ` +
      `~${totalEstimatedTokens.toLocaleString()} tokens`
    );

    onProgress?.({
      status: 'analyzing',
      message: 'Analysis complete!'
    });

    return analysis;
  } catch (error: any) {
    console.error('[Analysis] Error:', error);
    // Return basic analysis even on error
    return {
      pageCount: 1,
      estimatedTokens: 1000,
      contentType: 'text',
      quality: 'medium',
      language: 'english',
      isScholarly: false,
      structure: {
        hasTables: false,
        hasImages: false,
        hasColumns: false,
        hasFootnotes: false,
        headings: []
      },
      costEstimate: {
        tokens: 1000,
        cost: 0.0001,
        chunks: 1,
        processingTime: 5
      },
      recommendedChunkSize: PAGES_PER_CHUNK
    };
  }
}

/**
 * Create optimized prompt based on document analysis
 * The prompt is designed to let Gemini auto-detect document features
 */
export function createOptimizedPrompt(analysis: DocumentAnalysis, isChunk: boolean = false, chunkNum?: number, totalChunks?: number): string {
  let prompt = '';

  if (isChunk && chunkNum && totalChunks) {
    prompt = `Convert this PDF section to clean Markdown.

This is part ${chunkNum} of ${totalChunks} from a larger document.
${chunkNum > 1 ? 'Continue from where the previous section ended.\n' : ''}`;
  } else {
    prompt = `Convert this PDF document to clean Markdown.\n`;
  }

  // Add hints based on filename analysis if detected
  if (analysis.language === 'latin') {
    prompt += `\nThis appears to be a Latin/medieval document. Please:
- Restore classical Latin diacriticals (æ, œ) where appropriate
- Use ## for chapter headings (CAP., CAPUT, etc.)\n`;
  }

  prompt += `
## Instructions:
- Preserve ALL text exactly as it appears
- Auto-detect and handle: tables, multi-column layouts, footnotes, images
- For multi-column text: read left column first (top-to-bottom), then right column
- Convert tables to Markdown format with | separators
- Format footnotes using [^1] notation with definitions at the end
- Use proper heading levels (# for title, ## for sections, ### for subsections)
- Preserve paragraph structure and document flow
- For images: describe briefly as [Image: description]
- Do NOT include page numbers or recurring headers/footers
- Do NOT wrap output in code blocks
- Do NOT add commentary, just the converted text

Output clean, readable Markdown.`;

  return prompt;
}

// =============================================================================
// IMAGE OCR - Process photos/images using Gemini Vision
// =============================================================================

const IMAGE_OCR_PROMPT = `Extract and convert all text from this image to clean Markdown.

## Instructions:
- Preserve ALL text exactly as it appears
- Auto-detect and handle: tables, handwriting, printed text, multi-column layouts
- Convert tables to Markdown format with | separators
- Use proper heading levels if document structure is visible
- Preserve paragraph structure and document flow
- For diagrams/charts: describe briefly as [Image: description]
- Do NOT wrap output in code blocks
- Do NOT add commentary, just the extracted text

If the image contains handwritten notes, do your best to transcribe accurately.
Output clean, readable Markdown.`;

const IMAGE_OCR_MULTI_PROMPT = (imageNum: number, totalImages: number) => `Extract and convert all text from this image to clean Markdown.

This is image ${imageNum} of ${totalImages} from a multi-page document.
${imageNum > 1 ? 'Continue from where the previous page ended.\n' : ''}

## Instructions:
- Preserve ALL text exactly as it appears
- Auto-detect and handle: tables, handwriting, printed text, multi-column layouts
- Convert tables to Markdown format with | separators
- Use proper heading levels if document structure is visible
- Preserve paragraph structure and document flow
- For diagrams/charts: describe briefly as [Image: description]
- Do NOT wrap output in code blocks
- Do NOT add commentary, just the extracted text

If the image contains handwritten notes, do your best to transcribe accurately.
Output clean, readable Markdown.`;

export interface ImageOCRResult {
  content: string;
  imageCount: number;
  processingTimeMs: number;
}

export interface ImageOCRProgress {
  status: 'reading' | 'processing' | 'completed' | 'error';
  message: string;
  currentImage?: number;
  totalImages?: number;
}

type ImageProgressCallback = (progress: ImageOCRProgress) => void;

/**
 * Call Gemini API for image OCR
 */
async function callGeminiImageOCR(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: imageBase64,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.5,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        const errorMsg = err.error?.message || `Gemini API Error: ${response.status}`;

        if (response.status >= 500 || response.status === 429) {
          console.warn(`[Image OCR] Attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
          lastError = new Error(errorMsg);

          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`[Image OCR] Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        throw new Error(errorMsg);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('No content returned from Gemini');
      }

      return cleanLLMOutput(text);
    } catch (error: any) {
      lastError = error;

      if (attempt < maxRetries && (error.message?.includes('fetch') || error.message?.includes('500'))) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[Image OCR] Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        console.log(`[Image OCR] Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * Convert File to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Get MIME type from file
 */
function getImageMimeType(file: File): string {
  // Common image types supported by Gemini
  const mimeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'heif': 'image/heif',
  };

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return mimeMap[ext] || file.type || 'image/jpeg';
}

/**
 * Process a single image file and convert to Markdown using Gemini OCR
 */
export async function processImage(
  file: File,
  onProgress?: ImageProgressCallback
): Promise<ImageOCRResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env');
  }

  const startTime = Date.now();

  const report = (status: ImageOCRProgress['status'], message: string, extra: Partial<ImageOCRProgress> = {}) => {
    onProgress?.({ status, message, ...extra });
  };

  report('reading', 'Reading image...');

  const imageBase64 = await fileToBase64(file);
  const mimeType = getImageMimeType(file);

  report('processing', 'Processing image with Gemini...', { currentImage: 1, totalImages: 1 });

  const content = await callGeminiImageOCR(apiKey, imageBase64, mimeType, IMAGE_OCR_PROMPT);

  const processingTimeMs = Date.now() - startTime;

  report('completed', 'Image processing complete!');

  return {
    content,
    imageCount: 1,
    processingTimeMs,
  };
}

/**
 * Process multiple image files and convert to Markdown using Gemini OCR
 * Images are processed sequentially and combined into a single document
 */
export async function processImages(
  files: File[],
  onProgress?: ImageProgressCallback
): Promise<ImageOCRResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env');
  }

  if (files.length === 0) {
    throw new Error('No images provided');
  }

  // Single image - use simple processing
  if (files.length === 1) {
    return processImage(files[0], onProgress);
  }

  const startTime = Date.now();
  const results: string[] = [];

  const report = (status: ImageOCRProgress['status'], message: string, extra: Partial<ImageOCRProgress> = {}) => {
    onProgress?.({ status, message, ...extra });
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const imageNum = i + 1;

    report('reading', `Reading image ${imageNum}/${files.length}...`, {
      currentImage: imageNum,
      totalImages: files.length,
    });

    const imageBase64 = await fileToBase64(file);
    const mimeType = getImageMimeType(file);

    report('processing', `Processing image ${imageNum}/${files.length}...`, {
      currentImage: imageNum,
      totalImages: files.length,
    });

    const prompt = IMAGE_OCR_MULTI_PROMPT(imageNum, files.length);
    const content = await callGeminiImageOCR(apiKey, imageBase64, mimeType, prompt);

    results.push(content);
  }

  const processingTimeMs = Date.now() - startTime;

  // Combine results with page separators
  const combinedContent = results.join('\n\n---\n\n');

  report('completed', `Processed ${files.length} images successfully!`);

  return {
    content: combinedContent,
    imageCount: files.length,
    processingTimeMs,
  };
}
