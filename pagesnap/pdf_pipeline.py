#!/usr/bin/env python3
"""
PDF OCR Pipeline for Doodle Scanner

Processes uploaded PDFs through Gemini 3 Flash Preview with intelligent chunking.
Based on the tested ocr_pipeline.py with full document support.
"""

import os
import sys
import base64
import json
import tempfile
import time
import re
import threading
import multiprocessing
from pathlib import Path
from datetime import datetime
from typing import Optional, Callable, Dict, Any

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from google import genai
except ImportError:
    genai = None


# Configuration
GEMINI_MODEL = "gemini-3-flash-preview"
MAX_OUTPUT_TOKENS = 64000
DEFAULT_CHUNK_SIZE = 10

# Robustness settings
API_TIMEOUT_SECONDS = 120  # 2 minutes per chunk
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2  # Exponential backoff: 2, 4, 8 seconds
RATE_LIMIT_DELAY = 1.0  # Seconds between API calls


def load_env():
    """Load environment variables from .env files."""
    env_paths = [
        Path(__file__).parent / ".env",
        Path.cwd() / ".env",
        Path.home() / ".env",
    ]

    for env_path in env_paths:
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        # Override existing env vars with project .env
                        os.environ[key.strip()] = value.strip()
            break


def get_gemini_client():
    """Initialize Gemini client with API key."""
    if genai is None:
        raise RuntimeError("google-genai not installed. Run: pip install google-genai")

    load_env()

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not found in environment")

    return genai.Client(api_key=api_key)


# ============================================================================
# PDF Utilities
# ============================================================================

def get_pdf_info(pdf_path: str) -> dict:
    """Get basic information about a PDF."""
    if fitz is None:
        raise RuntimeError("PyMuPDF not installed. Run: pip install pymupdf")

    doc = fitz.open(pdf_path)

    info = {
        "path": pdf_path,
        "filename": Path(pdf_path).name,
        "page_count": len(doc),
        "metadata": doc.metadata,
    }

    doc.close()
    return info


def extract_pages_as_pdf(input_path: str, start_page: int, end_page: int) -> bytes:
    """Extract a range of pages from PDF and return as PDF bytes."""
    if fitz is None:
        raise RuntimeError("PyMuPDF not installed. Run: pip install pymupdf")

    doc = fitz.open(input_path)

    # Clamp to actual page count
    end_page = min(end_page, len(doc) - 1)

    # Create new PDF with selected pages
    new_doc = fitz.open()
    new_doc.insert_pdf(doc, from_page=start_page, to_page=end_page)

    # Get bytes
    pdf_bytes = new_doc.tobytes()

    new_doc.close()
    doc.close()

    return pdf_bytes


# ============================================================================
# Prompts
# ============================================================================

ANALYSIS_PROMPT = """Analyze this PDF sample and provide a JSON analysis:

{
  "document_type": "book|article|manuscript|newsletter|other",
  "language": "english|latin|german|french|mixed|other",
  "has_two_columns": true/false,
  "has_footnotes": true/false,
  "footnote_style": "numbered|symbols|none",
  "has_headers_footers": true/false,
  "running_header_text": "exact text of running header if present, or null",
  "running_footer_text": "exact text of running footer if present, or null",
  "has_page_numbers": true/false,
  "page_number_position": "top-left|top-center|top-right|bottom-left|bottom-center|bottom-right|none",
  "has_chapter_titles": true/false,
  "chapter_title_format": "description of how chapters are marked, e.g. 'CHAPTER I' or 'Chapter One'",
  "estimated_words_per_page": number,
  "special_features": ["list", "of", "features"],
  "recommended_chunk_size": number (pages per chunk for OCR),
  "notes": "any special observations about this document"
}

IMPORTANT: For running_header_text, provide the EXACT repeated text that appears at the top of most pages (like a book title or chapter name). This will be used to strip it from OCR output.

Be precise about language detection. If the main body is Latin, say "latin".
Only return valid JSON, no other text."""


LATIN_OCR_PROMPT = """You are an expert in Medieval Latin manuscripts and scholarly editions.

Extract the complete text from this PDF section, producing clean Markdown.

## Critical Instructions:

1. **Two-column layout**: If present, read each column top-to-bottom, left column first, then right column. Do NOT merge columns horizontally.

2. **Latin diacriticals**: Restore classical Latin forms:
   - Use ae (not ae) for the ligature
   - Use oe (not oe) for the ligature
   - Preserve any accents in the original

3. **Structure**:
   - Use ## (h2) for chapter headings (CAP. I, CAP. II, etc.)
   - Use ### (h3) for section titles within chapters
   - Format chapters as: ## CAP. I. - DE TRITICO

4. **Footnotes**: Convert footnote markers to Markdown [^1], [^2] format.
   Place footnote definitions at the end of the output.

5. **Column markers**: Note column numbers as HTML comments: <!-- col. 1125 -->

6. **Do NOT include**:
   - Page numbers
   - Running headers/footers
   - Any commentary or explanations

Output clean Markdown with the complete Latin text."""


GENERAL_OCR_PROMPT_BASE = """Convert this PDF section to clean Markdown.

## Instructions:

1. **Headers**: Use appropriate ## and ### for titles and sections
2. **Formatting**: Preserve italics, bold, and blockquotes
3. **Tables**: Convert to Markdown table format
4. **Footnotes**: Use [^1] notation, definitions at the end
5. **Images/Diagrams**: Describe as [Image: brief description]
6. **Structure**: Preserve paragraph breaks and document flow

{exclusions}

{inclusions}

Output clean, readable Markdown."""


def build_ocr_prompt(analysis: dict, preferences: dict = None) -> str:
    """Build OCR prompt based on analysis and user preferences."""
    if preferences is None:
        preferences = {}

    # Default preferences
    include_page_numbers = preferences.get('include_page_numbers', False)
    include_page_breaks = preferences.get('include_page_breaks', False)
    strip_headers = preferences.get('strip_headers', True)
    strip_footers = preferences.get('strip_footers', True)

    # Build exclusions list
    exclusions = ["## Do NOT include:", "- Code block wrappers around output", "- Commentary or explanations"]

    if not include_page_numbers:
        exclusions.append("- Page numbers")

    if strip_headers:
        header_text = analysis.get('running_header_text')
        if header_text:
            exclusions.append(f"- Running header text: \"{header_text}\" (appears at top of pages)")
        else:
            exclusions.append("- Running headers at the top of pages")

    if strip_footers:
        footer_text = analysis.get('running_footer_text')
        if footer_text:
            exclusions.append(f"- Running footer text: \"{footer_text}\" (appears at bottom of pages)")
        else:
            exclusions.append("- Running footers at the bottom of pages")

    # Build inclusions list
    inclusions = []

    if include_page_breaks:
        inclusions.append("## Include:")
        inclusions.append("- Add '---' (horizontal rule) between each page to mark page breaks")

    if include_page_numbers:
        if not inclusions:
            inclusions.append("## Include:")
        inclusions.append("- Page numbers in format: <!-- page X -->")

    # Use Latin prompt if detected
    if analysis.get('language') == 'latin':
        return LATIN_OCR_PROMPT

    return GENERAL_OCR_PROMPT_BASE.format(
        exclusions="\n".join(exclusions),
        inclusions="\n".join(inclusions) if inclusions else ""
    )


# Keep simple version for backwards compatibility
GENERAL_OCR_PROMPT = GENERAL_OCR_PROMPT_BASE.format(
    exclusions="""## Do NOT include:
- Page numbers
- Running headers/footers
- Code block wrappers around output
- Commentary or explanations""",
    inclusions=""
)


# ============================================================================
# OCR Processing
# ============================================================================

def clean_output(text: str) -> str:
    """Clean up Gemini output - remove code blocks and artifacts."""
    if text is None:
        raise ValueError("Gemini returned empty response (possibly blocked by safety filter)")

    cleaned = text.strip()

    # Remove markdown code block wrappers
    if cleaned.startswith("```markdown"):
        cleaned = cleaned[11:].strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:].strip()

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()

    # Remove end chunk markers
    cleaned = cleaned.replace("<!-- END_CHUNK -->", "").strip()

    return cleaned


def _gemini_worker(pdf_bytes: bytes, prompt: str, api_key: str, result_queue):
    """Worker function for multiprocessing - runs Gemini API call."""
    try:
        # Import inside worker since this runs in a separate process
        from google import genai as worker_genai

        client = worker_genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                worker_genai.types.Part.from_bytes(
                    data=pdf_bytes,
                    mime_type="application/pdf"
                ),
                prompt
            ],
            config=worker_genai.types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=MAX_OUTPUT_TOKENS,
            )
        )

        # Check for empty/blocked response
        if response.text is None:
            # Try to get more info about why
            if hasattr(response, 'prompt_feedback') and response.prompt_feedback:
                result_queue.put(('error', f"Response blocked: {response.prompt_feedback}"))
            elif hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'finish_reason'):
                    result_queue.put(('error', f"Empty response, finish_reason: {candidate.finish_reason}"))
                else:
                    result_queue.put(('error', "Empty response from Gemini (no text returned)"))
            else:
                result_queue.put(('error', "Empty response from Gemini (possibly safety filtered)"))
            return

        result_queue.put(('success', response.text))
    except Exception as e:
        result_queue.put(('error', str(e)))


def _call_gemini_with_timeout(pdf_bytes: bytes, prompt: str, api_key: str, timeout: int) -> str:
    """Call Gemini API with a real timeout using multiprocessing."""
    # Use a queue to get results from the subprocess
    result_queue = multiprocessing.Queue()

    # Start the worker process
    process = multiprocessing.Process(
        target=_gemini_worker,
        args=(pdf_bytes, prompt, api_key, result_queue)
    )
    process.start()

    # Wait for completion with timeout
    process.join(timeout=timeout)

    if process.is_alive():
        # Process is still running - kill it!
        print(f"    [TIMEOUT] Killing hung API call after {timeout}s")
        process.terminate()
        process.join(timeout=5)  # Give it 5s to terminate gracefully

        if process.is_alive():
            # Force kill if still alive
            process.kill()
            process.join(timeout=2)

        raise TimeoutError(f"Gemini API call timed out after {timeout}s")

    # Get result from queue
    if result_queue.empty():
        raise RuntimeError("Worker process died without returning a result")

    status, data = result_queue.get()

    if status == 'error':
        raise RuntimeError(data)

    return data


def ocr_pdf_chunk(
    api_key: str,
    pdf_bytes: bytes,
    prompt: str,
    chunk_info: str = "",
    max_retries: int = MAX_RETRIES,
    timeout: int = API_TIMEOUT_SECONDS,
) -> str:
    """Send PDF bytes to Gemini for OCR processing with retry and timeout."""

    full_prompt = prompt + (f"\n\n{chunk_info}" if chunk_info else "")
    last_error = None

    for attempt in range(max_retries):
        try:
            # Rate limiting - brief pause between retries
            if attempt > 0:
                backoff = RETRY_BACKOFF_BASE ** attempt
                print(f"    [Retry {attempt + 1}/{max_retries} after {backoff}s backoff]")
                time.sleep(backoff)

            result = _call_gemini_with_timeout(pdf_bytes, full_prompt, api_key, timeout)
            return clean_output(result)

        except TimeoutError as e:
            last_error = e
            print(f"    [Timeout on attempt {attempt + 1}/{max_retries}]")

        except Exception as e:
            last_error = e
            error_str = str(e).lower()

            # Check for rate limiting
            if "rate" in error_str or "quota" in error_str or "429" in error_str:
                wait_time = RETRY_BACKOFF_BASE ** (attempt + 2)
                print(f"    [Rate limited, waiting {wait_time}s...]")
                time.sleep(wait_time)
            # Check for server errors (5xx)
            elif "500" in error_str or "503" in error_str or "server" in error_str:
                print(f"    [Server error on attempt {attempt + 1}/{max_retries}]")
            else:
                # Unknown error - don't retry
                print(f"    [Non-retryable error: {error_str[:100]}]")
                raise

    # All retries exhausted
    raise RuntimeError(f"OCR failed after {max_retries} attempts: {last_error}")


def analyze_document(api_key: str, pdf_path: str, sample_pages: int = 5) -> dict:
    """Analyze first few pages to understand document structure."""
    # Extract sample pages
    pdf_bytes = extract_pages_as_pdf(pdf_path, 0, sample_pages - 1)

    try:
        result = ocr_pdf_chunk(api_key, pdf_bytes, ANALYSIS_PROMPT)

        # Parse JSON from response
        if result.startswith("{"):
            return json.loads(result)
        else:
            # Try to find JSON in response
            match = re.search(r'\{[\s\S]*\}', result)
            if match:
                return json.loads(match.group(0))
    except Exception as e:
        pass  # Fall through to defaults

    # Return defaults
    return {
        "document_type": "other",
        "language": "english",
        "has_two_columns": False,
        "has_footnotes": False,
        "estimated_words_per_page": 300,
        "recommended_chunk_size": 10,
    }


def validate_chunk(content: str, chunk_num: int, total_chunks: int) -> list:
    """Validate chunk output for common issues."""
    issues = []

    # Check for truncation indicators
    if content.endswith("...") or content.endswith("..."):
        issues.append("possible truncation")

    # Check for very short output (might indicate failure)
    if len(content) < 500:
        issues.append("suspiciously short")

    # Check for error markers in output
    if "<!-- OCR FAILED" in content or "<!-- ERROR" in content:
        issues.append("contains error markers")

    # Check for unbalanced markdown
    open_bold = content.count("**")
    if open_bold % 2 != 0:
        issues.append("unbalanced bold markers")

    return issues


BOUNDARY_SMOOTHING_PROMPT = """You are cleaning up OCR output at a page/chunk boundary.

Here is the END of one section and the START of the next:

=== END OF PREVIOUS SECTION ===
{chunk_a_tail}

=== START OF NEXT SECTION ===
{chunk_b_head}

Your task is to return a SMOOTHED version that:

1. **Merge broken sentences**: If the previous section ends mid-sentence and the next continues it, join them properly
2. **Remove duplicate headers**: If the next section starts with a title/header that's just a repeat of the book title or running header, remove it
3. **Clean artifacts**: Remove "...", "[continued]", or similar artifacts at the boundary
4. **Preserve real content**: Don't remove actual paragraphs or chapter headings - only remove obvious duplicates/artifacts

Return ONLY the smoothed text that should replace this boundary region. The format should be:

[corrected end of previous section]

[corrected start of next section]

If no changes are needed, return the text exactly as provided."""


def smooth_boundary(api_key: str, chunk_a_tail: str, chunk_b_head: str, timeout: int = 60) -> tuple:
    """
    Smooth the boundary between two chunks using AI.

    Returns (smoothed_a_tail, smoothed_b_head) or original if smoothing fails.
    """
    prompt = BOUNDARY_SMOOTHING_PROMPT.format(
        chunk_a_tail=chunk_a_tail,
        chunk_b_head=chunk_b_head
    )

    try:
        # Use a simple direct call since this is text-only (no PDF)
        from google import genai as smooth_genai
        client = smooth_genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[prompt],
            config=smooth_genai.types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=2000,
            )
        )

        result = response.text.strip()

        # Split result back into two parts
        # Look for a clear paragraph break in the middle
        paragraphs = result.split('\n\n')
        if len(paragraphs) >= 2:
            # Find roughly the middle split point
            mid = len(paragraphs) // 2
            new_a_tail = '\n\n'.join(paragraphs[:mid])
            new_b_head = '\n\n'.join(paragraphs[mid:])
            return (new_a_tail.strip(), new_b_head.strip())
        else:
            # Can't split cleanly, return original
            return (chunk_a_tail, chunk_b_head)

    except Exception as e:
        print(f"    [Boundary smoothing failed: {e}]")
        return (chunk_a_tail, chunk_b_head)


def smooth_all_boundaries(api_key: str, chunks: list, progress_callback=None) -> list:
    """
    Apply boundary smoothing between all adjacent chunks.

    Args:
        api_key: Gemini API key
        chunks: List of chunk text strings
        progress_callback: Optional callback(completed, total, description)

    Returns:
        List of smoothed chunks
    """
    if len(chunks) <= 1:
        return chunks

    smoothed = list(chunks)  # Copy
    total_boundaries = len(chunks) - 1

    # Size of boundary region to extract (characters)
    BOUNDARY_SIZE = 600

    for i in range(total_boundaries):
        if progress_callback:
            progress_callback(i, total_boundaries, f"Smoothing boundary {i+1}/{total_boundaries}")

        chunk_a = smoothed[i]
        chunk_b = smoothed[i + 1]

        # Skip if either chunk is an error marker
        if '<!-- CHUNK' in chunk_a and 'FAILED' in chunk_a:
            continue
        if '<!-- CHUNK' in chunk_b and 'FAILED' in chunk_b:
            continue

        # Extract boundary regions
        a_tail = chunk_a[-BOUNDARY_SIZE:] if len(chunk_a) > BOUNDARY_SIZE else chunk_a
        b_head = chunk_b[:BOUNDARY_SIZE] if len(chunk_b) > BOUNDARY_SIZE else chunk_b

        # Smooth the boundary
        new_a_tail, new_b_head = smooth_boundary(api_key, a_tail, b_head)

        # Replace boundary regions in chunks
        if len(chunk_a) > BOUNDARY_SIZE:
            smoothed[i] = chunk_a[:-BOUNDARY_SIZE] + new_a_tail
        else:
            smoothed[i] = new_a_tail

        if len(chunk_b) > BOUNDARY_SIZE:
            smoothed[i + 1] = new_b_head + chunk_b[BOUNDARY_SIZE:]
        else:
            smoothed[i + 1] = new_b_head

        # Brief pause between API calls
        time.sleep(0.5)

    return smoothed


def assemble_document(chunks: list, pdf_info: dict, analysis: dict) -> str:
    """Assemble final document from chunks with proper headers and metadata."""
    lines = []

    # Header
    lines.append(f"# {pdf_info['filename']}")
    lines.append("")
    lines.append(f"*{pdf_info['page_count']} pages - OCR processed {datetime.now().strftime('%Y-%m-%d')}*")
    lines.append("")

    # Document info
    if pdf_info.get('metadata', {}).get('title'):
        lines.append(f"**Title:** {pdf_info['metadata']['title']}")
    if pdf_info.get('metadata', {}).get('author'):
        lines.append(f"**Author:** {pdf_info['metadata']['author']}")
    if analysis.get('language') and analysis['language'] != 'unknown':
        lines.append(f"**Language:** {analysis['language'].title()}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Concatenate chunks
    for chunk in chunks:
        if chunk.strip():
            lines.append(chunk.strip())
            lines.append("")

    return "\n".join(lines)


# ============================================================================
# Main Processing Functions
# ============================================================================

def get_api_key() -> str:
    """Get Gemini API key from environment."""
    load_env()
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not found in environment")
    return api_key


def process_pdf(
    pdf_path: str,
    output_path: str = None,
    chunk_size: int = None,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    preferences: Dict[str, Any] = None,
    analysis: Dict[str, Any] = None,
) -> Dict[str, Any]:
    """
    Process a PDF with intelligent chunking.

    Args:
        pdf_path: Path to the PDF file
        output_path: Where to save the output markdown
        chunk_size: Pages per chunk (auto-detected if None)
        progress_callback: Called with (completed, total, current_chunk_description)
        preferences: User preferences for OCR (include_page_numbers, include_page_breaks, etc.)
        analysis: Pre-computed analysis (skip analysis step if provided)

    Returns:
        Dictionary with processing results
    """
    api_key = get_api_key()
    pdf_info = get_pdf_info(pdf_path)
    total_pages = pdf_info['page_count']

    # Step 1: Analyze document (skip if pre-computed)
    if analysis is None:
        if progress_callback:
            progress_callback(0, total_pages, "Analyzing document...")
        analysis = analyze_document(api_key, pdf_path)

    # Determine chunk size
    if chunk_size is None:
        chunk_size = analysis.get('recommended_chunk_size', DEFAULT_CHUNK_SIZE)
        # Conservative default for dense scholarly texts
        if analysis.get('language') == 'latin' or analysis.get('has_two_columns'):
            chunk_size = min(chunk_size, 12)

    # Build prompt with user preferences
    prompt = build_ocr_prompt(analysis, preferences)

    # Calculate chunks
    chunks = []
    start = 0
    while start < total_pages:
        end = min(start + chunk_size, total_pages)
        chunks.append((start, end))
        start = end

    # Process each chunk with rate limiting
    chunk_results = []
    all_content = []
    consecutive_failures = 0
    max_consecutive_failures = 3  # Abort if 3 chunks fail in a row

    for i, (start_page, end_page) in enumerate(chunks):
        chunk_num = i + 1
        page_range = f"Pages {start_page + 1}-{end_page}"

        if progress_callback:
            progress_callback(start_page, total_pages, f"Chunk {chunk_num}/{len(chunks)}: {page_range}")

        try:
            # Rate limiting between chunks
            if i > 0:
                time.sleep(RATE_LIMIT_DELAY)

            # Extract chunk PDF
            pdf_bytes = extract_pages_as_pdf(pdf_path, start_page, end_page - 1)

            # Build chunk context
            chunk_info = f"""(Processing pages {start_page + 1}-{end_page} of {total_pages})

CONTINUATION CONTEXT:
- This is chunk {chunk_num} of {len(chunks)}
- {"Start of document" if chunk_num == 1 else "Continue from previous chunk"}
- {"Final chunk - complete all remaining content" if chunk_num == len(chunks) else "More content follows in next chunk"}
- Maintain consistent heading levels and footnote numbering"""

            # OCR the chunk with retry logic
            start_time = time.time()
            result = ocr_pdf_chunk(api_key, pdf_bytes, prompt, chunk_info)
            elapsed = time.time() - start_time

            # Validate chunk
            issues = validate_chunk(result, chunk_num, len(chunks))

            chunk_results.append({
                "chunk_num": chunk_num,
                "pages": page_range,
                "chars": len(result),
                "time": elapsed,
                "issues": issues,
            })

            all_content.append(result)
            consecutive_failures = 0  # Reset on success

        except Exception as e:
            consecutive_failures += 1
            error_msg = str(e)

            chunk_results.append({
                "chunk_num": chunk_num,
                "pages": page_range,
                "error": error_msg,
            })
            all_content.append(f"\n\n<!-- CHUNK {chunk_num} FAILED: {error_msg} -->\n\n")

            # Log the failure
            print(f"    [ERROR] Chunk {chunk_num} failed: {error_msg[:100]}")

            # Check for too many consecutive failures
            if consecutive_failures >= max_consecutive_failures:
                print(f"    [ABORT] {max_consecutive_failures} consecutive failures, stopping processing")
                # Add placeholder for remaining chunks
                for j in range(i + 1, len(chunks)):
                    remaining_start, remaining_end = chunks[j]
                    chunk_results.append({
                        "chunk_num": j + 1,
                        "pages": f"Pages {remaining_start + 1}-{remaining_end}",
                        "error": "Skipped due to consecutive failures",
                    })
                    all_content.append(f"\n\n<!-- CHUNK {j + 1} SKIPPED -->\n\n")
                break

    # Optional: Smooth boundaries between chunks
    smooth_boundaries = preferences.get('smooth_boundaries', True) if preferences else True

    if smooth_boundaries and len(all_content) > 1:
        if progress_callback:
            progress_callback(total_pages, total_pages, "Smoothing chunk boundaries...")

        def boundary_progress(completed, total, desc):
            # Map boundary progress to a small range at the end
            if progress_callback:
                progress_callback(total_pages, total_pages, desc)

        all_content = smooth_all_boundaries(api_key, all_content, boundary_progress)

    # Assemble final document
    if progress_callback:
        progress_callback(total_pages, total_pages, "Assembling document...")

    final_content = assemble_document(all_content, pdf_info, analysis)

    # Save output
    if output_path is None:
        output_dir = Path(pdf_path).parent
        output_path = output_dir / f"{Path(pdf_path).stem}_ocr.md"
    else:
        output_path = Path(output_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(final_content)

    # Calculate totals
    total_chars = sum(c.get("chars", 0) for c in chunk_results)
    total_time = sum(c.get("time", 0) for c in chunk_results)
    failed_chunks = sum(1 for c in chunk_results if "error" in c)

    return {
        "pdf_info": pdf_info,
        "analysis": analysis,
        "output_path": str(output_path),
        "total_chars": total_chars,
        "total_time": total_time,
        "chunks_total": len(chunks),
        "chunks_failed": failed_chunks,
        "chunk_results": chunk_results,
    }


# ============================================================================
# CLI
# ============================================================================

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="PDF OCR Pipeline - Convert PDFs to Markdown via Gemini"
    )
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument(
        "--chunk-size", "-c",
        type=int,
        help="Pages per chunk (default: auto-detected)"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output markdown file path"
    )

    args = parser.parse_args()

    # Validate input
    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"Error: File not found: {args.pdf_path}")
        sys.exit(1)

    if not pdf_path.suffix.lower() == ".pdf":
        print(f"Error: Not a PDF file: {args.pdf_path}")
        sys.exit(1)

    # Progress callback for CLI
    def progress(completed, total, description):
        pct = int(completed / total * 100) if total > 0 else 0
        print(f"  [{pct:3d}%] {description}")

    print(f"\nProcessing: {pdf_path.name}")
    print(f"{'='*50}")

    result = process_pdf(
        str(pdf_path),
        output_path=args.output,
        chunk_size=args.chunk_size,
        progress_callback=progress
    )

    print(f"\n{'='*50}")
    print(f"Complete!")
    print(f"  Output: {result['output_path']}")
    print(f"  Characters: {result['total_chars']:,}")
    print(f"  Time: {result['total_time']:.1f}s")
    print(f"  Chunks: {result['chunks_total'] - result['chunks_failed']}/{result['chunks_total']} successful")


if __name__ == "__main__":
    main()
