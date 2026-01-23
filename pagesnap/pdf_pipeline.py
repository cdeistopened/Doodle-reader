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
  "has_page_numbers": true/false,
  "estimated_words_per_page": number,
  "special_features": ["list", "of", "features"],
  "recommended_chunk_size": number (pages per chunk for OCR),
  "notes": "any special observations about this document"
}

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


GENERAL_OCR_PROMPT = """Convert this PDF section to clean Markdown.

## Instructions:

1. **Headers**: Use appropriate ## and ### for titles and sections
2. **Formatting**: Preserve italics, bold, and blockquotes
3. **Tables**: Convert to Markdown table format
4. **Footnotes**: Use [^1] notation, definitions at the end
5. **Images/Diagrams**: Describe as [Image: brief description]
6. **Structure**: Preserve paragraph breaks and document flow

## Do NOT include:
- Page numbers
- Running headers/footers
- Code block wrappers around output
- Commentary or explanations

Output clean, readable Markdown."""


# ============================================================================
# OCR Processing
# ============================================================================

def clean_output(text: str) -> str:
    """Clean up Gemini output - remove code blocks and artifacts."""
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


def ocr_pdf_chunk(client, pdf_bytes: bytes, prompt: str, chunk_info: str = "") -> str:
    """Send PDF bytes to Gemini for OCR processing."""

    # Build the request
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            genai.types.Part.from_bytes(
                data=pdf_bytes,
                mime_type="application/pdf"
            ),
            prompt + (f"\n\n{chunk_info}" if chunk_info else "")
        ],
        config=genai.types.GenerateContentConfig(
            temperature=0.3,  # Lower for more consistent output
            max_output_tokens=MAX_OUTPUT_TOKENS,
        )
    )

    return clean_output(response.text)


def analyze_document(client, pdf_path: str, sample_pages: int = 5) -> dict:
    """Analyze first few pages to understand document structure."""
    # Extract sample pages
    pdf_bytes = extract_pages_as_pdf(pdf_path, 0, sample_pages - 1)

    try:
        result = ocr_pdf_chunk(client, pdf_bytes, ANALYSIS_PROMPT)

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

def process_pdf(
    pdf_path: str,
    output_path: str = None,
    chunk_size: int = None,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> Dict[str, Any]:
    """
    Process a PDF with intelligent chunking.

    Args:
        pdf_path: Path to the PDF file
        output_path: Where to save the output markdown
        chunk_size: Pages per chunk (auto-detected if None)
        progress_callback: Called with (completed, total, current_chunk_description)

    Returns:
        Dictionary with processing results
    """
    client = get_gemini_client()
    pdf_info = get_pdf_info(pdf_path)
    total_pages = pdf_info['page_count']

    # Step 1: Analyze document
    if progress_callback:
        progress_callback(0, total_pages, "Analyzing document...")

    analysis = analyze_document(client, pdf_path)

    # Determine chunk size
    if chunk_size is None:
        chunk_size = analysis.get('recommended_chunk_size', DEFAULT_CHUNK_SIZE)
        # Conservative default for dense scholarly texts
        if analysis.get('language') == 'latin' or analysis.get('has_two_columns'):
            chunk_size = min(chunk_size, 12)

    # Choose prompt
    if analysis.get("language") == "latin":
        prompt = LATIN_OCR_PROMPT
    else:
        prompt = GENERAL_OCR_PROMPT

    # Calculate chunks
    chunks = []
    start = 0
    while start < total_pages:
        end = min(start + chunk_size, total_pages)
        chunks.append((start, end))
        start = end

    # Process each chunk
    chunk_results = []
    all_content = []

    for i, (start_page, end_page) in enumerate(chunks):
        chunk_num = i + 1
        page_range = f"Pages {start_page + 1}-{end_page}"

        if progress_callback:
            progress_callback(start_page, total_pages, page_range)

        try:
            # Extract chunk PDF
            pdf_bytes = extract_pages_as_pdf(pdf_path, start_page, end_page - 1)

            # Build chunk context
            chunk_info = f"""(Processing pages {start_page + 1}-{end_page} of {total_pages})

CONTINUATION CONTEXT:
- This is chunk {chunk_num} of {len(chunks)}
- {"Start of document" if chunk_num == 1 else "Continue from previous chunk"}
- {"Final chunk - complete all remaining content" if chunk_num == len(chunks) else "More content follows in next chunk"}
- Maintain consistent heading levels and footnote numbering"""

            # OCR the chunk
            start_time = time.time()
            result = ocr_pdf_chunk(client, pdf_bytes, prompt, chunk_info)
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

        except Exception as e:
            chunk_results.append({
                "chunk_num": chunk_num,
                "pages": page_range,
                "error": str(e),
            })
            all_content.append(f"\n\n<!-- CHUNK {chunk_num} FAILED: {e} -->\n\n")

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
