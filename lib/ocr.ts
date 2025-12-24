/**
 * Doodle Reader - PDF OCR Service
 *
 * Uses Gemini 3 for PDF-to-Markdown conversion.
 * Handles chunking for large PDFs to stay within API limits.
 * Enhanced with Tesseract pre-analysis for cost estimation and smart processing.
 */

import { PDFDocument } from 'pdf-lib';
import Tesseract from 'tesseract.js';

// Gemini 3 Pro - best for multimodal tasks including PDF OCR
const GEMINI_MODEL = 'gemini-3-pro-preview';

// Gemini API limits
const MAX_REQUEST_SIZE_MB = 20;
const MAX_OUTPUT_TOKENS = 64000;

// Based on testing: ~500-1000 tokens/page for dense content
// PDFs are expensive (~28K tokens for 50 pages)
// Use 40 pages per chunk to stay safely under output token limit
const PAGES_PER_CHUNK = 40;

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

export interface OCRProgress {
  status: 'reading' | 'analyzing' | 'processing' | 'completed' | 'error';
  message: string;
  currentPage?: number;
  totalPages?: number;
  currentChunk?: number;
  totalChunks?: number;
  currentFile?: string;
  totalFiles?: number;
}

export interface DocumentAnalysis {
  pageCount: number;
  estimatedTokens: number;
  contentType: 'text' | 'mixed' | 'image-heavy';
  quality: 'high' | 'medium' | 'low';
  structure: {
    hasTables: boolean;
    hasImages: boolean;
    hasColumns: boolean;
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
 * Call Gemini API for OCR
 */
async function callGeminiOCR(
  apiKey: string,
  pdfBase64: string,
  prompt: string
): Promise<string> {
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
    throw new Error(err.error?.message || `Gemini API Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No content returned from Gemini');
  }

  return cleanLLMOutput(text);
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
      const results: string[] = [];

      for (let chunk = 0; chunk < numChunks; chunk++) {
        const startPage = chunk * pagesPerChunk;
        const endPage = Math.min(startPage + pagesPerChunk - 1, totalPages - 1);

        report('processing', `Processing pages ${startPage + 1}-${endPage + 1}...`, {
          currentPage: startPage + 1,
          totalPages,
          currentChunk: chunk + 1,
          totalChunks: numChunks,
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
        
        const chunkContent = await callGeminiOCR(apiKey, chunkBase64, chunkPrompt);
        results.push(chunkContent);
      }

      // Combine all chunks
      fullContent = results.join('\n\n---\n\n');
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
 * Analyze PDF document using Tesseract for cost estimation and processing strategy
 */
export async function analyzeDocument(
  file: File,
  onProgress?: ProgressCallback
): Promise<DocumentAnalysis> {
  const startTime = Date.now();
  
  onProgress?.({ 
    status: 'analyzing', 
    message: 'Analyzing document structure...' 
  });

  try {
    // Load PDF to get page count and extract a sample page
    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const fileSizeMB = pdfBytes.length / (1024 * 1024);

    // Extract first page for Tesseract analysis
    const samplePdfBytes = await extractPageRange(pdfBytes, 0, Math.min(0, pageCount - 1));
    const sampleBase64 = uint8ArrayToBase64(samplePdfBytes);

    // Use Tesseract to analyze the first page
    const { data: tesseractResult } = await Tesseract.recognize(
      sampleBase64.replace(/^data:application\/pdf;base64,/, ''),
      'eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            onProgress?.({
              status: 'analyzing',
              message: `Analyzing text content... ${Math.round(m.progress * 100)}%`
            });
          }
        }
      }
    );

    // Analyze the OCR results
    const text = tesseractResult.text;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    // Estimate tokens (rough approximation: 1 token ≈ 4 characters for English)
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length || 4;
    const estimatedTokensPerPage = Math.ceil((wordCount * avgWordLength) / 4);
    const totalEstimatedTokens = estimatedTokensPerPage * pageCount;

    // Determine content quality from Tesseract confidence
    const avgConfidence = tesseractResult.confidence;
    const quality: DocumentAnalysis['quality'] = 
      avgConfidence > 80 ? 'high' : avgConfidence > 60 ? 'medium' : 'low';

    // Detect content type and structure
    const hasTables = /\+[-+]+\+|\|.*\|/.test(text);
    const hasImages = tesseractResult.blocks?.some(block => 
      block.paragraphs.some(p => p.lines.some(l => l.words.some(w => w.confidence < 50)))
    ) || false;
    const hasColumns = text.split('\n').filter(line => line.trim()).length > wordCount / 10;

    // Extract potential headings (lines that look like titles)
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const headings = lines
      .filter(line => 
        line.length < 100 && 
        /^[A-Z]/.test(line.trim()) && 
        !line.includes('.') && 
        line.split(' ').length <= 8
      )
      .slice(0, 10);

    const contentType: DocumentAnalysis['contentType'] = 
      hasImages ? 'image-heavy' : hasTables ? 'mixed' : 'text';

    // Calculate recommended chunk size based on analysis
    let recommendedChunkSize = PAGES_PER_CHUNK;
    if (contentType === 'image-heavy') {
      recommendedChunkSize = Math.floor(PAGES_PER_CHUNK * 0.7); // Smaller chunks for image-heavy
    } else if (contentType === 'text' && quality === 'high') {
      recommendedChunkSize = Math.floor(PAGES_PER_CHUNK * 1.3); // Larger chunks for clean text
    }

    // Calculate cost estimate (Gemini Pro pricing: $0.0025 per 1K tokens for input)
    const costPerToken = 0.0025 / 1000;
    const estimatedCost = totalEstimatedTokens * costPerToken;

    // Estimate processing time (rough estimate based on complexity)
    const baseTimePerPage = 2; // seconds
    const complexityMultiplier = quality === 'high' ? 1 : quality === 'medium' ? 1.5 : 2;
    const estimatedProcessingTime = pageCount * baseTimePerPage * complexityMultiplier;

    const analysisTimeMs = Date.now() - startTime;

    const analysis: DocumentAnalysis = {
      pageCount,
      estimatedTokens: totalEstimatedTokens,
      contentType,
      quality,
      structure: {
        hasTables,
        hasImages,
        hasColumns,
        headings
      },
      costEstimate: {
        tokens: totalEstimatedTokens,
        cost: estimatedCost,
        chunks: Math.ceil(pageCount / recommendedChunkSize),
        processingTime: estimatedProcessingTime
      },
      recommendedChunkSize
    };

    console.log(
      `[Analysis] Completed for ${file.name}: ${pageCount} pages, ` +
      `${totalEstimatedTokens.toLocaleString()} tokens, ` +
      `estimated $${estimatedCost.toFixed(4)}`
    );

    onProgress?.({ 
      status: 'analyzing', 
      message: 'Analysis complete!' 
    });

    return analysis;
  } catch (error: any) {
    console.error('[Analysis] Error:', error);
    throw new Error(`Document analysis failed: ${error.message}`);
  }
}

/**
 * Create optimized prompt based on document analysis
 */
export function createOptimizedPrompt(analysis: DocumentAnalysis, isChunk: boolean = false, chunkNum?: number, totalChunks?: number): string {
  let prompt = '';

  if (isChunk && chunkNum && totalChunks) {
    prompt = `Convert this PDF section to clean Markdown.

This is part ${chunkNum} of ${totalChunks} from a larger document.\n`;
  } else {
    prompt = `Convert this PDF document to clean Markdown.\n`;
  }

  // Add specific instructions based on analysis
  if (analysis.quality === 'low') {
    prompt += `Note: This document has poor OCR quality. Focus on preserving readable text while fixing obvious OCR errors.\n`;
  }

  if (analysis.structure.hasTables) {
    prompt += `This document contains tables. Convert them to proper Markdown table format with | separators.\n`;
  }

  if (analysis.structure.hasImages) {
    prompt += `This document contains images. Briefly describe each image in [Image: description] format.\n`;
  }

  if (analysis.structure.hasColumns) {
    prompt += `This document appears to have multiple columns. Preserve the logical flow of content.\n`;
  }

  if (analysis.structure.headings.length > 0) {
    const sampleHeadings = analysis.structure.headings.slice(0, 3).join(', ');
    prompt += `Preserve document structure with headings like: ${sampleHeadings}.\n`;
  }

  prompt += `\nGeneral Instructions:
- Preserve ALL text exactly as it appears (fixing obvious OCR errors if quality is poor)
- Use proper heading levels (# for title, ## for sections, etc.)
- Format footnotes using [^1] notation
- Preserve paragraph structure
- Convert tables to Markdown tables if present
- Preserve emphasis (bold, italic) where visible
- Do NOT wrap output in code blocks
- Do NOT add commentary, just the converted text`;

  if (isChunk && chunkNum && totalChunks && chunkNum > 1) {
    prompt += `\n- Continue from where the previous section ended`;
  }

  return prompt;
}
