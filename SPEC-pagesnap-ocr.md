# OCR Tool - Product Specification

*Status: COMPLETE - Ready for implementation*
*Last Updated: 2026-01-21*

---

## Overview

A standalone web utility for converting scanned books and PDFs to clean Markdown. Two modes:

1. **Scan Mode** - Motion-detection camera capture (webcam or phone) for hands-free book scanning
2. **Upload Mode** - PDF upload with agentic OCR processing

The product absorbs PageSnap functionality and shares authentication with Doodle Reader.

---

## Product Vision

**Problem:** Scanning physical books is tedious, and OCR output is messy. Simple prompting produces inconsistent results on long documents with footnotes, columns, Latin text, and other edge cases.

**Solution:** An agentic OCR pipeline that:
- Analyzes the document before processing
- Interviews the user about preferences
- Intelligently chunks long documents
- Validates and re-processes problematic sections automatically
- Learns from errors over time

**Output:** One clean Markdown file per document.

---

## User Flow

### 1. Authentication
- **Account required** (Clerk integration)
- Shared account system with Doodle Reader
- Separate URL/branding for OCR tool

### 2. Input
- **Upload Mode:** Drag-and-drop PDF upload
- **Scan Mode:** Camera access (webcam OR phone camera, user's choice)
  - Motion detection auto-captures page turns
  - Session produces numbered JPG images → auto-converted to PDF

### 3. Pre-Flight Analysis
- Process **first 20 pages** as sample
- Detect:
  - Document type and language
  - Footnote style and frequency
  - Column layout
  - Front matter structure
  - Tables/images
  - Estimated word count per page

### 4. User Interview (Modal)
- **Show actual sample excerpts** from the analyzed pages
- Present preferences as toggles/checkboxes:
  - [ ] Preserve front matter fully
  - [ ] Include page number indicators
  - [ ] Chapter separation (single file vs. multiple)
  - Footnote handling (endnotes with continuous numbering by default)
- **Display credit cost estimate** (per-page pricing, extrapolated from word count)
- **Refuse to start** if insufficient credits

### 5. Processing
- Continues **server-side** even if user closes tab
- **Email download link** when complete
- Progress: real-time updates if user stays on page

### 6. Output
- Clean Markdown file (primary)
- Summary email with:
  - Processing stats (pages, time, chunks)
  - Any anomalies or decisions made
  - Download link (expires after X days)

---

## Technical Architecture

### Stack
- **Primary:** Python
  - PyMuPDF (fitz) for PDF page extraction
  - Google Gemini SDK for OCR
  - Flask for web service (later)
- **Secondary:** TypeScript (web UI, to be added)
- **Auth:** Clerk (shared with Doodle Reader)
- **Billing:** Stripe (per-page credits)
- **Deployment:** Railway

### Agentic OCR Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                    PDF Input                            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 1: Pre-Flight Analysis                           │
│  - Extract pages 1-20                                   │
│  - Send to Gemini for document analysis                 │
│  - Detect: language, structure, footnotes, columns      │
│  - Estimate tokens per page → credit cost               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  USER INTERVIEW (Modal)                                 │
│  - Show sample excerpts                                 │
│  - Preferences toggles                                  │
│  - Credit cost confirmation                             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 2: Chunked Processing                            │
│  - Split PDF into chunks (size based on Phase 1)        │
│  - Each chunk → Gemini OCR                              │
│  - Validate chunk boundaries                            │
│  - Re-process silently if errors detected               │
│  - Continuous footnote renumbering                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 3: Assembly                                      │
│  - Concatenate chunks                                   │
│  - Final validation pass                                │
│  - Generate Markdown output                             │
│  - Email download link                                  │
└─────────────────────────────────────────────────────────┘
```

### Chunk Boundary Validation
- Agent detects: mid-sentence splits, broken footnote references, orphaned headers
- **Authority:** Re-process silently (no user prompt)
- Log issues to learning file for pattern detection

### Output Token Limit
- Gemini 3 Pro Preview: 64,000 output tokens
- Chunk size calculated from Phase 1 word-count estimate
- Target: ~50,000 tokens per chunk (safety margin)

---

## Content Handling

### Footnotes
- Convert to **endnotes** with continuous numbering
- Markdown syntax: `[^1]`, `[^2]`, etc.
- All footnote text at document end

### Images/Diagrams
- **Describe in text:** `[Image: Brief description of diagram showing X]`
- Include page reference: `[Image on p.47: ...]`

### Front Matter
- User choice: preserve fully or skip
- Default: preserve (title page, copyright, TOC)

### Page Numbers
- User choice: include or omit
- If included: `<!-- Page 47 -->` HTML comments

---

## Credits & Pricing

### Model
- **Per-page pricing**
- Credits purchased via Stripe
- Free tier: ~$5 worth of credits on signup

### Cost Calculation
- Phase 1 estimates words per page
- Extrapolate to full document
- Apply multiplier on Gemini API cost (TBD based on testing)

### Guardrails
- **Warn upfront:** Refuse to start jobs exceeding remaining credits
- Show clear estimate before processing begins

---

## Learning System

### Append-Only Log
- Location: `ocr-tool/LEARNING_LOG.md`
- Entries include:
  - Date/time
  - Document characteristics
  - Issues encountered
  - Resolution (automatic or manual)
  - Proposed improvements

### Continuous Improvement
- Manual review of log
- Pattern detection → prompt refinement
- Edge case → specific handling rules

---

## Scan Mode (PageSnap Absorption)

### Camera Support
- **Webcam:** Laptop or external camera on tripod
- **Phone camera:** iPhone pointed at book (either streaming or batch upload)

### Motion Detection
- State machine: IDLE → TURNING → STABILIZING → CAPTURING → COOLDOWN
- Configurable thresholds for different lighting/setups
- ROI (region of interest) selection

### Output
- Session directory with numbered JPGs
- Auto-convert to PDF for OCR pipeline
- Or process images directly through Gemini

---

## Implementation Phases

### Phase 1: Core OCR Testing (Current)
- [ ] Set up `ocr-tool` project folder
- [ ] Build PDF page extraction (Python + PyMuPDF)
- [ ] Create Gemini OCR pipeline
- [ ] Test on Migne Latin PDF (123 pages)
- [ ] Document results in learning log

### Phase 2: Agentic Layer
- [ ] Implement pre-flight analysis
- [ ] Build user interview modal
- [ ] Add chunk boundary validation
- [ ] Implement silent re-processing

### Phase 3: Web Service
- [ ] Flask API endpoints
- [ ] Email notification system
- [ ] Clerk auth integration
- [ ] Stripe billing integration

### Phase 4: Scan Mode
- [ ] Port PageSnap Python code
- [ ] Webcam + phone camera support
- [ ] Integrate with OCR pipeline

### Phase 5: Polish
- [ ] TypeScript web UI
- [ ] Branding and domain
- [ ] Production deployment (Railway)

---

## Success Criteria

### First Test (Migne Latin PDF)
- [ ] Latin text is recognizable and properly formatted
- [ ] Diacriticals preserved (æ, œ, etc.)
- [ ] Footnotes correctly extracted
- [ ] No mid-word or mid-sentence breaks at chunk boundaries

### Production Ready
- [ ] 95%+ accuracy on English text
- [ ] 90%+ accuracy on Latin/non-English
- [ ] < 5 minute processing for 100-page document
- [ ] Credit estimates within 20% of actual cost

---

## Open Questions (To Resolve Through Testing)

1. Optimal chunk size for different document types?
2. How to detect chapter boundaries reliably?
3. Retry limit before escalating to user?
4. Two-column layout handling strategy?
5. Best prompt structure for Latin text?

---

## File References

### Source Material (Doodle Reader)
- `lib/ocr.ts` - TypeScript OCR engine
- `pdf-ocr.js` - Node.js CLI tool
- `pagesnap/` - Python scanning code
- `pagesnap/ocr_gemini.py` - Gemini OCR processor

### Test Document
- `migne-hildegard-physica.pdf` - 123 pages, Latin, medieval text

---

*Spec complete. Ready for implementation.*
