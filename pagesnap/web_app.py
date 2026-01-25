#!/usr/bin/env python3
"""
Doodle Scanner - Unified OCR Service

Two routes:
1. Upload existing PDF scan → Doodle OCR pipeline
2. Camera capture → PageSnap with motion detection

Part of Doodle Reader ecosystem.
"""
from __future__ import annotations

import time
import os
import json
import threading
import tempfile
import uuid
from pathlib import Path
from datetime import datetime
from enum import Enum
from dataclasses import dataclass
from typing import Optional, Tuple
from flask import Flask, render_template_string, Response, jsonify, request, send_file, url_for
from werkzeug.utils import secure_filename

# OpenCV is optional - only needed for camera capture (local use)
try:
    import cv2
    import numpy as np
    CAMERA_AVAILABLE = True
except ImportError:
    CAMERA_AVAILABLE = False
    # Create stub module with ndarray type for annotations
    class _NumpyStub:
        ndarray = type(None)  # Stub type for annotations
    np = _NumpyStub()
    cv2 = None

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max upload


class State(Enum):
    IDLE = "Monitoring..."
    TURNING = "Page turning..."
    STABILIZING = "Stabilizing..."
    CAPTURING = "Captured!"
    COOLDOWN = "Cooldown..."


@dataclass
class Config:
    motion_threshold: float = 3.0  # Delta above this = motion detected
    stability_threshold: float = 1.0  # Delta below this = stable
    stability_delay: float = 1.0
    cooldown_period: float = 2.0
    blur_kernel: int = 21
    jpeg_quality: int = 90
    detection_scale: float = 0.25


class PageSnapDetector:
    def __init__(self, config: Config):
        self.config = config
        self.state = State.IDLE
        self.previous_frame: Optional[np.ndarray] = None
        self.stability_start: Optional[float] = None
        self.cooldown_start: Optional[float] = None
        self.last_delta: float = 0.0
    
    def reset(self):
        self.previous_frame = None
        self.state = State.IDLE
        self.stability_start = None
        self.cooldown_start = None
    
    def process_frame(self, frame: np.ndarray, roi: Optional[Tuple[int, int, int, int]] = None) -> Tuple[State, bool]:
        should_capture = False
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        if roi and roi[2] > 0 and roi[3] > 0:
            x, y, w, h = roi
            gray = gray[y:y+h, x:x+w]
        
        small = cv2.resize(gray, None, fx=self.config.detection_scale, fy=self.config.detection_scale)
        blurred = cv2.GaussianBlur(small, (self.config.blur_kernel, self.config.blur_kernel), 0)
        
        if self.previous_frame is None:
            self.previous_frame = blurred
            return self.state, False
        
        diff = cv2.absdiff(blurred, self.previous_frame)
        self.last_delta = np.mean(diff)
        
        now = time.time()
        
        if self.state == State.IDLE:
            if self.last_delta > self.config.motion_threshold:
                self.state = State.TURNING
        elif self.state == State.TURNING:
            if self.last_delta < self.config.stability_threshold:
                self.state = State.STABILIZING
                self.stability_start = now
        elif self.state == State.STABILIZING:
            if self.last_delta > self.config.stability_threshold:
                self.state = State.TURNING
            elif self.stability_start and (now - self.stability_start) >= self.config.stability_delay:
                self.state = State.CAPTURING
                should_capture = True
                self.cooldown_start = now
        elif self.state == State.CAPTURING:
            self.state = State.COOLDOWN
        elif self.state == State.COOLDOWN:
            if self.cooldown_start and (now - self.cooldown_start) >= self.config.cooldown_period:
                self.state = State.IDLE
        
        self.previous_frame = blurred
        return self.state, should_capture


class PageSnapApp:
    def __init__(self, camera_index: int = 0):
        self.config = Config()
        self.detector = PageSnapDetector(self.config)
        self.camera_index = camera_index
        self.cap = None
        self.detection_active = False
        self.capture_count = 0
        self.roi = None  # (x, y, w, h) as percentages
        self.frame_width = 640
        self.frame_height = 480
        self.lock = threading.Lock()
        self.last_capture_time = 0
        self.ocr_status = self._initial_ocr_status()
        self.ocr_thread: Optional[threading.Thread] = None
        
        # Session setup
        self.session_name = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.output_dir = os.path.join(os.path.dirname(__file__), "sessions", self.session_name)
        os.makedirs(self.output_dir, exist_ok=True)

    def _initial_ocr_status(self):
        return {
            'state': 'idle',  # idle, running, complete, error
            'session': None,
            'completed': 0,
            'total': 0,
            'current_page': None,
            'output': None,
            'error': None
        }

    def reset_ocr_status(self):
        self.ocr_status = self._initial_ocr_status()
        self.ocr_thread = None

    def _start_ocr_thread(self, session_name: str, session_path: str, images: list):
        """Start OCR processing in a background thread."""
        def progress_callback(completed, total, current_file):
            with self.lock:
                self.ocr_status.update({
                    'completed': completed,
                    'total': total,
                    'current_page': current_file
                })

        def worker():
            try:
                from ocr_gemini import process_session
                output_path = process_session(
                    session_path,
                    progress_callback=progress_callback,
                    exit_on_error=False
                )
                with self.lock:
                    self.ocr_status.update({
                        'state': 'complete',
                        'output': output_path,
                        'error': None,
                        'completed': len(images),
                        'total': len(images),
                        'current_page': None
                    })
            except Exception as e:
                with self.lock:
                    self.ocr_status.update({
                        'state': 'error',
                        'error': str(e),
                        'current_page': None
                    })

        with self.lock:
            self.ocr_status.update({
                'state': 'running',
                'session': session_name,
                'completed': 0,
                'total': len(images),
                'current_page': None,
                'output': None,
                'error': None
            })

        self.ocr_thread = threading.Thread(target=worker, daemon=True)
        self.ocr_thread.start()

    def trigger_ocr(self, session_name: str):
        """Validate and start OCR for a session if not already running."""
        session_path = os.path.join(os.path.dirname(__file__), "sessions", session_name)
        if not os.path.exists(session_path):
            return False, f"Session not found: {session_name}"

        images = sorted([f for f in os.listdir(session_path) if f.endswith('.jpg')])
        if not images:
            return False, "No images in session"

        with self.lock:
            if self.ocr_status.get('state') == 'running':
                return False, "OCR already running"

        self._start_ocr_thread(session_name, session_path, images)
        return True, None
    
    def start_camera(self):
        if self.cap is None or not self.cap.isOpened():
            self.cap = cv2.VideoCapture(self.camera_index)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            self.frame_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            self.frame_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    def stop_camera(self):
        if self.cap:
            self.cap.release()
            self.cap = None
    
    def get_roi_pixels(self):
        if not self.roi:
            return None
        x_pct, y_pct, w_pct, h_pct = self.roi
        return (
            int(x_pct * self.frame_width),
            int(y_pct * self.frame_height),
            int(w_pct * self.frame_width),
            int(h_pct * self.frame_height)
        )
    
    def save_capture(self, frame: np.ndarray):
        self.capture_count += 1
        filename = f"{self.session_name}_{self.capture_count:04d}.jpg"
        filepath = os.path.join(self.output_dir, filename)
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, self.config.jpeg_quality]
        cv2.imwrite(filepath, frame, encode_params)
        self.last_capture_time = time.time()
        print(f"Captured: {filename}")
    
    def generate_frames(self):
        self.start_camera()
        
        while True:
            if self.cap is None:
                break
                
            ret, frame = self.cap.read()
            if not ret:
                continue
            
            original_frame = frame.copy()
            display_frame = frame.copy()
            
            with self.lock:
                state = State.IDLE
                should_capture = False
                
                if self.detection_active:
                    roi_pixels = self.get_roi_pixels()
                    state, should_capture = self.detector.process_frame(frame, roi_pixels)
                    
                    if should_capture:
                        self.save_capture(original_frame)
                
                # Status bar
                h, w = display_frame.shape[:2]
                colors = {
                    State.IDLE: (128, 128, 128),
                    State.TURNING: (0, 255, 255),
                    State.STABILIZING: (255, 128, 0),
                    State.CAPTURING: (0, 255, 0),
                    State.COOLDOWN: (128, 128, 128),
                }
                color = colors.get(state, (255, 255, 255))
                
                cv2.rectangle(display_frame, (0, h - 50), (w, h), (0, 0, 0), -1)
                status = state.value if self.detection_active else "PAUSED"
                cv2.putText(display_frame, status, (10, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
                cv2.putText(display_frame, f"Pages: {self.capture_count}", (w - 150, h - 20), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                
                # Flash on capture
                if time.time() - self.last_capture_time < 0.3:
                    cv2.rectangle(display_frame, (0, 0), (w - 1, h - 51), (0, 255, 0), 8)
            
            _, buffer = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_bytes = buffer.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')


# Only initialize camera app if OpenCV is available
page_snap = PageSnapApp(camera_index=0) if CAMERA_AVAILABLE else None


# ============================================================================
# PDF Upload Processing
# ============================================================================

class PDFJobManager:
    """Manages PDF upload and processing jobs."""

    def __init__(self):
        self.jobs = {}  # job_id -> job_state
        self.lock = threading.Lock()
        self.upload_dir = os.path.join(os.path.dirname(__file__), "uploads")
        os.makedirs(self.upload_dir, exist_ok=True)

    def create_job(self, filename: str, file_path: str, page_count: int) -> str:
        """Create a new PDF processing job."""
        job_id = str(uuid.uuid4())[:8]
        with self.lock:
            self.jobs[job_id] = {
                'id': job_id,
                'filename': filename,
                'file_path': file_path,
                'page_count': page_count,
                'status': 'pending',  # pending, analyzing, analyzed, processing, complete, error
                'analysis': None,
                'preferences': None,  # User preferences for OCR
                'progress': 0,
                'current_chunk': None,
                'output_path': None,
                'error': None,
                'created_at': datetime.now().isoformat(),
            }
        return job_id

    def get_job(self, job_id: str) -> Optional[dict]:
        """Get job state."""
        with self.lock:
            return self.jobs.get(job_id, {}).copy() if job_id in self.jobs else None

    def update_job(self, job_id: str, **kwargs):
        """Update job state."""
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id].update(kwargs)

    def list_jobs(self) -> list:
        """List all jobs."""
        with self.lock:
            return sorted(
                [j.copy() for j in self.jobs.values()],
                key=lambda x: x['created_at'],
                reverse=True
            )

    def analyze_job(self, job_id: str):
        """Run pre-flight analysis on a PDF job."""
        job = self.get_job(job_id)
        if not job:
            return False, "Job not found"

        if job['status'] != 'pending':
            return False, f"Job already {job['status']}"

        def worker():
            try:
                from pdf_pipeline import analyze_document, get_api_key, get_pdf_info

                self.update_job(job_id, status='analyzing')

                api_key = get_api_key()

                # Analyze first 20 pages (or all if fewer)
                sample_pages = min(20, job['page_count'])
                analysis = analyze_document(api_key, job['file_path'], sample_pages=sample_pages)

                # Calculate cost estimate
                # Gemini 3 Flash: ~$0.075/1M input, ~$0.30/1M output
                words_per_page = analysis.get('estimated_words_per_page', 300)
                total_words = words_per_page * job['page_count']
                # Rough token estimate: 1 token ≈ 0.75 words for text, plus image tokens
                input_tokens = job['page_count'] * 1800  # ~1800 tokens per page image
                output_tokens = int(total_words / 0.75)  # text output

                cost_input = (input_tokens / 1_000_000) * 0.075
                cost_output = (output_tokens / 1_000_000) * 0.30
                estimated_cost = round(cost_input + cost_output, 3)

                # Estimate processing time (rough: 3-5 seconds per page)
                estimated_minutes = round(job['page_count'] * 4 / 60, 1)

                analysis['estimated_cost_usd'] = estimated_cost
                analysis['estimated_minutes'] = estimated_minutes
                analysis['sample_pages_analyzed'] = sample_pages

                self.update_job(job_id, status='analyzed', analysis=analysis)

            except Exception as e:
                self.update_job(job_id, status='error', error=str(e))

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        return True, None

    def start_processing(self, job_id: str, preferences: dict = None):
        """Start processing a PDF job in background thread."""
        job = self.get_job(job_id)
        if not job:
            return False, "Job not found"

        if job['status'] not in ('analyzed', 'pending', 'error'):
            return False, f"Job already {job['status']}"

        # Store preferences if provided
        if preferences:
            self.update_job(job_id, preferences=preferences)
            job['preferences'] = preferences

        def worker():
            try:
                from pdf_pipeline import process_pdf, get_pdf_info

                # Track last activity for watchdog
                last_activity = [time.time()]

                def progress_callback(completed, total, description):
                    last_activity[0] = time.time()
                    pct = int(completed / total * 100) if total > 0 else 0
                    self.update_job(
                        job_id,
                        progress=pct,
                        current_chunk=description,
                        last_activity=datetime.now().isoformat()
                    )

                self.update_job(
                    job_id,
                    status='processing',
                    started_at=datetime.now().isoformat(),
                    last_activity=datetime.now().isoformat()
                )

                # Output path
                output_dir = os.path.join(os.path.dirname(__file__), "output")
                os.makedirs(output_dir, exist_ok=True)
                output_path = os.path.join(output_dir, f"{job_id}_{Path(job['filename']).stem}_ocr.md")

                result = process_pdf(
                    job['file_path'],
                    output_path=output_path,
                    progress_callback=progress_callback,
                    preferences=job.get('preferences'),
                    analysis=job.get('analysis'),  # Pass pre-computed analysis
                )

                # Check for partial failures
                chunks_failed = result.get('chunks_failed', 0)
                chunks_total = result.get('chunks_total', 0)

                final_status = 'complete'
                if chunks_failed > 0:
                    if chunks_failed == chunks_total:
                        final_status = 'error'
                    else:
                        final_status = 'complete'  # Partial success still counts as complete

                self.update_job(
                    job_id,
                    status=final_status,
                    output_path=result['output_path'],
                    analysis=result.get('analysis'),
                    total_chars=result.get('total_chars'),
                    total_time=result.get('total_time'),
                    chunks_total=chunks_total,
                    chunks_failed=chunks_failed,
                    progress=100,
                    current_chunk=None,
                    completed_at=datetime.now().isoformat()
                )

            except Exception as e:
                import traceback
                error_detail = f"{str(e)}\n{traceback.format_exc()}"
                print(f"[ERROR] Job {job_id} failed: {error_detail}")
                self.update_job(
                    job_id,
                    status='error',
                    error=str(e),
                    error_detail=error_detail,
                    completed_at=datetime.now().isoformat()
                )

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        return True, None


pdf_manager = PDFJobManager()


# ============================================================================
# HTML Templates
# ============================================================================

LANDING_PAGE = '''
<!DOCTYPE html>
<html>
<head>
    <title>Doodle Scanner</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --ink: #1a1a1a;
            --ink-soft: #3d3d3d;
            --ink-muted: #6b6b6b;
            --cream: #faf8f5;
            --cream-warm: #f5f2ed;
            --surface: #ffffff;
            --border: #d4d0c8;
            --accent: #4f46e5;
            --accent-muted: #6366f1;
            --accent-soft: #e0e7ff;
            --success: #16a34a;
            --error: #dc2626;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--cream);
            color: var(--ink);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 60px 24px;
        }
        .logo {
            font-family: 'Cormorant Garamond', Georgia, serif;
            font-size: 42px;
            font-weight: 600;
            color: var(--ink);
            margin-bottom: 8px;
        }
        .tagline {
            font-size: 16px;
            color: var(--ink-muted);
            margin-bottom: 48px;
        }
        .routes {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 24px;
            max-width: 800px;
            width: 100%;
        }
        .route-card {
            background: var(--surface);
            border: 2px solid var(--ink);
            border-radius: 12px;
            padding: 32px;
            text-decoration: none;
            color: var(--ink);
            transition: all 0.15s;
            box-shadow: 4px 4px 0 var(--ink);
        }
        .route-card:hover {
            transform: translate(-4px, -4px);
            box-shadow: 8px 8px 0 var(--ink);
        }
        .route-card:active {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0 var(--ink);
        }
        .route-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        .route-title {
            font-family: 'Cormorant Garamond', Georgia, serif;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .route-desc {
            font-size: 14px;
            color: var(--ink-soft);
            line-height: 1.5;
        }
        .route-badge {
            display: inline-block;
            padding: 4px 10px;
            background: var(--accent-soft);
            color: var(--accent);
            font-size: 12px;
            font-weight: 600;
            border-radius: 4px;
            margin-top: 16px;
        }
        .footer {
            margin-top: 48px;
            font-size: 13px;
            color: var(--ink-muted);
        }
        .footer a {
            color: var(--accent);
            text-decoration: none;
        }
        .footer a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="logo">Doodle Scanner</div>
    <div class="tagline">Convert books and documents to clean Markdown</div>

    <div class="routes">
        <a href="/upload" class="route-card">
            <div class="route-icon">📄</div>
            <div class="route-title">Upload PDF</div>
            <div class="route-desc">
                Already have a scanned PDF? Upload it and we'll extract clean, readable text with intelligent chunking and language detection.
            </div>
            <span class="route-badge">Doodle OCR</span>
        </a>

        <a href="/camera" class="route-card">
            <div class="route-icon">📷</div>
            <div class="route-title">Scan with Camera</div>
            <div class="route-desc">
                Point your camera at a book and flip pages. We'll automatically detect page turns and capture each page for OCR processing.
            </div>
            <span class="route-badge">Doodle Scanner</span>
        </a>
    </div>

    <div class="footer">
        Part of <a href="http://localhost:3001">Doodle Reader</a>
    </div>
</body>
</html>
'''


UPLOAD_PAGE = '''
<!DOCTYPE html>
<html>
<head>
    <title>Upload PDF — Doodle OCR</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --ink: #1a1a1a;
            --ink-soft: #3d3d3d;
            --ink-muted: #6b6b6b;
            --cream: #faf8f5;
            --cream-warm: #f5f2ed;
            --surface: #ffffff;
            --border: #d4d0c8;
            --accent: #4f46e5;
            --accent-soft: #e0e7ff;
            --success: #16a34a;
            --error: #dc2626;
            --warning: #d97706;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--cream);
            color: var(--ink);
            min-height: 100vh;
            padding: 24px;
        }
        .container { max-width: 800px; margin: 0 auto; }
        .back-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 14px;
            color: var(--accent);
            text-decoration: none;
            margin-bottom: 24px;
            font-weight: 500;
        }
        .back-link:hover { text-decoration: underline; }
        .header {
            margin-bottom: 32px;
            padding-bottom: 16px;
            border-bottom: 2px solid var(--border);
        }
        .header h1 {
            font-family: 'Cormorant Garamond', Georgia, serif;
            font-size: 32px;
            font-weight: 600;
        }
        .header .subtitle {
            font-size: 14px;
            color: var(--ink-muted);
            margin-top: 4px;
        }
        .upload-zone {
            border: 3px dashed var(--border);
            border-radius: 12px;
            padding: 48px;
            text-align: center;
            margin-bottom: 24px;
            transition: all 0.2s;
            cursor: pointer;
            background: var(--surface);
        }
        .upload-zone:hover, .upload-zone.dragover {
            border-color: var(--accent);
            background: var(--accent-soft);
        }
        .upload-zone.uploading {
            border-color: var(--ink-muted);
            opacity: 0.7;
            pointer-events: none;
        }
        .upload-icon { font-size: 48px; margin-bottom: 16px; }
        .upload-text {
            font-size: 16px;
            font-weight: 500;
            margin-bottom: 8px;
        }
        .upload-hint {
            font-size: 13px;
            color: var(--ink-muted);
        }
        #file-input { display: none; }

        .jobs-section {
            background: var(--surface);
            border: 2px solid var(--border);
            border-radius: 12px;
            padding: 24px;
        }
        .jobs-section h2 {
            font-family: 'Cormorant Garamond', Georgia, serif;
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 16px;
        }
        .job-list { list-style: none; }
        .job-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            border-bottom: 1px solid var(--border);
        }
        .job-item:last-child { border-bottom: none; }
        .job-name {
            font-weight: 500;
            margin-bottom: 4px;
        }
        .job-meta {
            font-size: 13px;
            color: var(--ink-muted);
        }
        .job-status {
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }
        .status-pending { background: var(--cream-warm); color: var(--ink-muted); }
        .status-analyzing { background: #fef3c7; color: #d97706; }
        .status-analyzed { background: #dbeafe; color: #2563eb; }
        .status-processing { background: var(--accent-soft); color: var(--accent); }
        .status-complete { background: #dcfce7; color: var(--success); }
        .status-error { background: #fee2e2; color: var(--error); }
        .job-actions { display: flex; gap: 8px; margin-top: 8px; }

        /* Analysis Modal */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        .modal-overlay.active { display: flex; }
        .modal {
            background: var(--surface);
            border-radius: 12px;
            padding: 32px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }
        .modal h2 {
            font-family: 'Cormorant Garamond', Georgia, serif;
            font-size: 24px;
            margin-bottom: 16px;
        }
        .analysis-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid var(--border);
        }
        .analysis-label { color: var(--ink-muted); font-size: 14px; }
        .analysis-value { font-weight: 500; }
        .cost-box {
            background: var(--accent-soft);
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
            text-align: center;
        }
        .cost-amount {
            font-size: 28px;
            font-weight: 700;
            color: var(--accent);
        }
        .cost-label { font-size: 13px; color: var(--ink-muted); }
        .modal-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }
        .modal-btn {
            flex: 1;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            border: 2px solid var(--border);
            background: var(--surface);
        }
        .modal-btn.primary {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
        }
        .modal-btn:hover { opacity: 0.9; }
        .preferences-section {
            border-top: 1px solid var(--border);
            padding-top: 16px;
            margin-top: 16px;
        }
        .preference-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 0;
            cursor: pointer;
            font-size: 14px;
        }
        .preference-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: var(--accent);
        }
        .preference-item .pref-detail {
            font-size: 12px;
            color: var(--ink-muted);
            font-style: italic;
        }
        .job-btn {
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid var(--border);
            border-radius: 4px;
            cursor: pointer;
            background: var(--surface);
            color: var(--ink);
            text-decoration: none;
        }
        .job-btn:hover { background: var(--cream); }
        .job-btn.primary {
            background: var(--accent);
            color: white;
            border-color: var(--accent);
        }
        .job-progress {
            margin-top: 8px;
            font-size: 12px;
            color: var(--ink-muted);
        }
        .empty-state {
            text-align: center;
            padding: 32px;
            color: var(--ink-muted);
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Doodle Scanner</a>

        <div class="header">
            <h1>Upload PDF</h1>
            <div class="subtitle">Upload a scanned PDF to extract clean Markdown text</div>
        </div>

        <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
            <div class="upload-icon">📄</div>
            <div class="upload-text">Drop PDF here or click to browse</div>
            <div class="upload-hint">Max 100MB • Scanned books and documents work best</div>
            <input type="file" id="file-input" accept=".pdf" onchange="handleFile(this.files[0])">
        </div>

        <div class="jobs-section">
            <h2>Recent Jobs</h2>
            <ul class="job-list" id="job-list">
                <li class="empty-state">No jobs yet. Upload a PDF to get started.</li>
            </ul>
        </div>
    </div>

    <!-- Analysis Confirmation Modal -->
    <div class="modal-overlay" id="analysis-modal">
        <div class="modal">
            <h2>📊 Document Analysis</h2>
            <div id="analysis-content"></div>

            <div class="preferences-section">
                <h3 style="font-size: 14px; font-weight: 600; margin: 20px 0 12px; color: var(--ink-soft);">Output Preferences</h3>

                <label class="preference-item">
                    <input type="checkbox" id="pref-strip-headers" checked>
                    <span>Strip running headers</span>
                    <span class="pref-detail" id="header-detail"></span>
                </label>

                <label class="preference-item">
                    <input type="checkbox" id="pref-strip-footers" checked>
                    <span>Strip running footers</span>
                    <span class="pref-detail" id="footer-detail"></span>
                </label>

                <label class="preference-item">
                    <input type="checkbox" id="pref-page-breaks">
                    <span>Include page breaks (---)</span>
                </label>

                <label class="preference-item">
                    <input type="checkbox" id="pref-page-numbers">
                    <span>Include page numbers</span>
                </label>

                <div style="border-top: 1px solid var(--border); margin-top: 12px; padding-top: 12px;">
                    <label class="preference-item">
                        <input type="checkbox" id="pref-smooth-boundaries" checked>
                        <span>AI boundary smoothing</span>
                        <span class="pref-detail">(fixes broken sentences, removes duplicate headers)</span>
                    </label>
                </div>
            </div>

            <div class="modal-actions">
                <button class="modal-btn" onclick="closeModal()">Cancel</button>
                <button class="modal-btn primary" onclick="confirmProcessing()">Start Processing</button>
            </div>
        </div>
    </div>

    <script>
        let pendingJobId = null;
        const uploadZone = document.getElementById('upload-zone');

        // Drag and drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                handleFile(file);
            }
        });

        function handleFile(file) {
            if (!file || file.type !== 'application/pdf') {
                alert('Please select a PDF file');
                return;
            }

            uploadZone.classList.add('uploading');
            uploadZone.querySelector('.upload-text').textContent = 'Uploading...';

            const formData = new FormData();
            formData.append('file', file);

            fetch('/api/upload', {
                method: 'POST',
                body: formData
            })
            .then(r => r.json())
            .then(data => {
                uploadZone.classList.remove('uploading');
                uploadZone.querySelector('.upload-text').textContent = 'Drop PDF here or click to browse';

                if (data.error) {
                    alert('Upload failed: ' + data.error);
                } else {
                    // Start analysis instead of processing
                    pendingJobId = data.job_id;
                    fetch('/api/jobs/' + data.job_id + '/analyze', { method: 'POST' });
                    refreshJobs();
                    // Poll for analysis completion
                    pollForAnalysis(data.job_id);
                }
            })
            .catch(err => {
                uploadZone.classList.remove('uploading');
                uploadZone.querySelector('.upload-text').textContent = 'Drop PDF here or click to browse';
                alert('Upload failed: ' + err);
            });
        }

        function refreshJobs() {
            fetch('/api/jobs')
                .then(r => r.json())
                .then(data => {
                    const list = document.getElementById('job-list');
                    if (data.jobs.length === 0) {
                        list.innerHTML = '<li class="empty-state">No jobs yet. Upload a PDF to get started.</li>';
                        return;
                    }

                    list.innerHTML = data.jobs.map(job => {
                        const statusClass = 'status-' + job.status;
                        const statusText = job.status.charAt(0).toUpperCase() + job.status.slice(1);

                        let actions = '';
                        if (job.status === 'complete' && job.output_path) {
                            actions = `<a href="/api/jobs/${job.id}/download" class="job-btn primary">Download</a>`;
                        } else if (job.status === 'pending') {
                            actions = `<button onclick="analyzeJob('${job.id}')" class="job-btn primary">Analyze</button>`;
                        } else if (job.status === 'analyzed') {
                            actions = `<button onclick="showAnalysisModal(${JSON.stringify(job).replace(/"/g, '&quot;')})" class="job-btn primary">Review & Start</button>`;
                        } else if (job.status === 'processing' || job.status === 'analyzing') {
                            actions = `<button onclick="cancelJob('${job.id}')" class="job-btn" style="color: var(--error);">Cancel</button>`;
                        } else if (job.status === 'error') {
                            actions = `<button onclick="retryJob('${job.id}')" class="job-btn">Retry</button>`;
                        }

                        let progress = '';
                        if (job.status === 'processing' && job.current_chunk) {
                            progress = `<div class="job-progress">${job.progress}% - ${job.current_chunk}</div>`;
                        } else if (job.status === 'complete' && job.chunks_failed > 0) {
                            progress = `<div class="job-progress" style="color: var(--warning);">⚠ ${job.chunks_failed}/${job.chunks_total} chunks failed</div>`;
                        } else if (job.status === 'error' && job.error) {
                            progress = `<div class="job-progress" style="color: var(--error);">Error: ${job.error.substring(0, 100)}</div>`;
                        }

                        let meta = `${job.page_count} pages`;
                        if (job.analysis && job.analysis.estimated_cost_usd) {
                            meta += ` • Est. $${job.analysis.estimated_cost_usd.toFixed(3)}`;
                        }
                        if (job.analysis && job.analysis.language) {
                            meta += ` • ${job.analysis.language.charAt(0).toUpperCase() + job.analysis.language.slice(1)}`;
                        }

                        return `
                            <li class="job-item">
                                <div>
                                    <div class="job-name">${job.filename}</div>
                                    <div class="job-meta">${meta}</div>
                                    ${progress}
                                    <div class="job-actions">${actions}</div>
                                </div>
                                <span class="job-status ${statusClass}">${statusText}</span>
                            </li>
                        `;
                    }).join('');
                });
        }

        function startJob(jobId) {
            fetch('/api/jobs/' + jobId + '/start', { method: 'POST' })
                .then(() => refreshJobs());
        }

        function cancelJob(jobId) {
            if (confirm('Cancel this job?')) {
                fetch('/api/jobs/' + jobId + '/cancel', { method: 'POST' })
                    .then(() => refreshJobs());
            }
        }

        function retryJob(jobId) {
            fetch('/api/jobs/' + jobId + '/start', { method: 'POST' })
                .then(() => refreshJobs());
        }

        function analyzeJob(jobId) {
            pendingJobId = jobId;
            fetch('/api/jobs/' + jobId + '/analyze', { method: 'POST' })
                .then(() => {
                    refreshJobs();
                    pollForAnalysis(jobId);
                });
        }

        function pollForAnalysis(jobId) {
            const poll = setInterval(() => {
                fetch('/api/jobs/' + jobId)
                    .then(r => r.json())
                    .then(job => {
                        if (job.status === 'analyzed' && job.analysis) {
                            clearInterval(poll);
                            showAnalysisModal(job);
                        } else if (job.status === 'error') {
                            clearInterval(poll);
                            alert('Analysis failed: ' + job.error);
                        }
                    });
            }, 1000);
        }

        function showAnalysisModal(job) {
            pendingJobId = job.id;
            const a = job.analysis;
            const content = document.getElementById('analysis-content');

            content.innerHTML = `
                <div class="analysis-item">
                    <span class="analysis-label">Document</span>
                    <span class="analysis-value">${job.filename}</span>
                </div>
                <div class="analysis-item">
                    <span class="analysis-label">Pages</span>
                    <span class="analysis-value">${job.page_count}</span>
                </div>
                <div class="analysis-item">
                    <span class="analysis-label">Type</span>
                    <span class="analysis-value">${a.document_type || 'Unknown'}</span>
                </div>
                <div class="analysis-item">
                    <span class="analysis-label">Language</span>
                    <span class="analysis-value">${(a.language || 'Unknown').charAt(0).toUpperCase() + (a.language || 'unknown').slice(1)}</span>
                </div>
                <div class="analysis-item">
                    <span class="analysis-label">Two Columns</span>
                    <span class="analysis-value">${a.has_two_columns ? 'Yes' : 'No'}</span>
                </div>
                <div class="analysis-item">
                    <span class="analysis-label">Footnotes</span>
                    <span class="analysis-value">${a.has_footnotes ? 'Yes (' + (a.footnote_style || 'numbered') + ')' : 'No'}</span>
                </div>
                <div class="analysis-item">
                    <span class="analysis-label">Est. Processing Time</span>
                    <span class="analysis-value">~${a.estimated_minutes || '?'} minutes</span>
                </div>

                <div class="cost-box">
                    <div class="cost-label">Estimated API Cost</div>
                    <div class="cost-amount">$${(a.estimated_cost_usd || 0).toFixed(3)}</div>
                    <div class="cost-label">Based on ${a.sample_pages_analyzed || '?'} sample pages analyzed</div>
                </div>

                ${a.notes ? `<p style="font-size: 13px; color: var(--ink-muted); margin-top: 12px;"><strong>Notes:</strong> ${a.notes}</p>` : ''}
            `;

            // Show detected header/footer in preferences
            const headerDetail = document.getElementById('header-detail');
            const footerDetail = document.getElementById('footer-detail');

            if (a.running_header_text) {
                headerDetail.textContent = `"${a.running_header_text}"`;
            } else if (a.has_headers_footers) {
                headerDetail.textContent = '(detected)';
            } else {
                headerDetail.textContent = '(none detected)';
            }

            if (a.running_footer_text) {
                footerDetail.textContent = `"${a.running_footer_text}"`;
            } else {
                footerDetail.textContent = '(none detected)';
            }

            document.getElementById('analysis-modal').classList.add('active');
        }

        function closeModal() {
            document.getElementById('analysis-modal').classList.remove('active');
            pendingJobId = null;
        }

        function confirmProcessing() {
            if (pendingJobId) {
                // Collect preferences from checkboxes
                const preferences = {
                    strip_headers: document.getElementById('pref-strip-headers').checked,
                    strip_footers: document.getElementById('pref-strip-footers').checked,
                    include_page_breaks: document.getElementById('pref-page-breaks').checked,
                    include_page_numbers: document.getElementById('pref-page-numbers').checked,
                    smooth_boundaries: document.getElementById('pref-smooth-boundaries').checked,
                };

                fetch('/api/jobs/' + pendingJobId + '/start', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ preferences })
                })
                    .then(() => {
                        closeModal();
                        refreshJobs();
                    });
            }
        }

        // Poll for updates
        refreshJobs();
        setInterval(refreshJobs, 2000);
    </script>
</body>
</html>
'''


HTML_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>Page Snap — Doodle Reader</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --ink: #1a1a1a;
            --ink-soft: #3d3d3d;
            --ink-muted: #6b6b6b;
            --cream: #faf8f5;
            --cream-warm: #f5f2ed;
            --surface: #ffffff;
            --border: #d4d0c8;
            --accent: #4f46e5;
            --accent-soft: #e0e7ff;
            --success: #16a34a;
            --error: #dc2626;
            --warning: #f59e0b;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--cream);
            color: var(--ink);
            min-height: 100vh;
            padding: 24px;
        }
        .container { max-width: 900px; margin: 0 auto; }

        .back-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 14px;
            color: var(--accent);
            text-decoration: none;
            margin-bottom: 16px;
            font-weight: 500;
        }
        .back-link:hover { text-decoration: underline; }

        h1 {
            font-family: 'Cormorant Garamond', Georgia, serif;
            font-size: 28px;
            margin-bottom: 8px;
        }
        .subtitle { color: var(--ink-muted); margin-bottom: 24px; }

        /* Main scanner frame */
        .scanner-frame {
            background: var(--surface);
            border: 2px solid var(--ink);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 6px 6px 0 var(--ink);
        }

        /* Camera area with status overlay */
        .camera-area {
            background: #1a1a1a;
            position: relative;
        }
        #video-feed {
            width: 100%;
            display: block;
        }

        /* Status bar overlay on camera */
        .status-bar {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.8);
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .status-text {
            color: #888;
            font-size: 14px;
            font-weight: 500;
        }
        .status-text.scanning { color: #4ade80; }
        .status-text.turning { color: #fbbf24; }
        .status-text.processing { color: #60a5fa; }
        .status-text.error { color: #f87171; }

        .page-count {
            color: white;
            font-size: 20px;
            font-weight: 700;
            font-family: 'SF Mono', ui-monospace, monospace;
        }

        /* Motion indicator - subtle bar */
        .motion-bar {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 4px;
            height: 60px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            overflow: hidden;
        }
        .motion-level {
            position: absolute;
            bottom: 0;
            width: 100%;
            background: #4ade80;
            border-radius: 2px;
            transition: height 0.2s;
        }
        .motion-level.high { background: #fbbf24; }

        /* Controls area */
        .controls-area {
            padding: 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
        }

        .main-button {
            width: 100%;
            max-width: 320px;
            padding: 18px 32px;
            font-size: 16px;
            font-weight: 600;
            border: 2px solid var(--ink);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.15s;
            font-family: 'Inter', sans-serif;
            box-shadow: 3px 3px 0 var(--ink);
        }
        .main-button:hover:not(:disabled) {
            transform: translate(-2px, -2px);
            box-shadow: 5px 5px 0 var(--ink);
        }
        .main-button:active:not(:disabled) {
            transform: translate(2px, 2px);
            box-shadow: 1px 1px 0 var(--ink);
        }
        .main-button:disabled {
            cursor: wait;
            opacity: 0.7;
        }

        .btn-start { background: var(--accent); color: white; }
        .btn-stop { background: var(--error); color: white; }
        .btn-processing { background: var(--ink-muted); color: white; }
        .btn-done { background: var(--success); color: white; }

        .secondary-actions {
            display: flex;
            gap: 16px;
            font-size: 14px;
        }
        .secondary-actions a {
            color: var(--ink-muted);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .secondary-actions a:hover { color: var(--accent); }

        /* Settings panel (hidden by default) */
        .settings-panel {
            display: none;
            background: var(--cream-warm);
            padding: 20px 24px;
            border-top: 1px solid var(--border);
        }
        .settings-panel.visible { display: block; }
        .settings-panel h3 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--ink-soft);
        }
        .setting-row {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
        }
        .setting-row label {
            width: 120px;
            font-size: 13px;
        }
        .setting-row input[type="range"] {
            flex: 1;
            margin: 0 12px;
            accent-color: var(--accent);
        }
        .setting-row select {
            flex: 1;
            margin: 0 12px;
            padding: 6px;
            border: 1px solid var(--border);
            border-radius: 4px;
            font-size: 13px;
        }
        .setting-row .value {
            width: 40px;
            font-size: 13px;
            font-weight: 600;
            text-align: right;
        }

        /* Results panel */
        .results-panel {
            display: none;
            padding: 24px;
            text-align: center;
        }
        .results-panel.visible { display: block; }
        .results-icon { font-size: 48px; margin-bottom: 12px; }
        .results-title { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
        .results-meta { color: var(--ink-muted); font-size: 14px; margin-bottom: 20px; }
        .results-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .results-btn {
            padding: 10px 20px;
            border: 2px solid var(--border);
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            background: var(--surface);
        }
        .results-btn:hover { background: var(--cream); }
        .results-btn.primary {
            background: var(--accent);
            color: white;
            border-color: var(--accent);
        }
        .results-btn.primary:hover { background: var(--accent); opacity: 0.9; }

        /* Capture flash effect */
        #capture-flash {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(79, 70, 229, 0.3);
            pointer-events: none;
            z-index: 1000;
        }
        .capture-sound { display: none; }

        /* Hidden data */
        #session-name, #output-dir { display: none; }
    </style>
</head>
<body>
    <div id="capture-flash"></div>
    <audio id="capture-sound" class="capture-sound" preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2LkpONgHBkZHN/ipSUjoF0aGZue4qUlo+DdsHBwb2/vry+vMDAvL+/vb++vby8u76+vL6+vb6+vb2+vr6+vb69vb29vry8vL28vb28vLy7u7y8vLy7" type="audio/wav">
    </audio>

    <!-- Hidden data elements -->
    <span id="session-name">{{ session_name }}</span>
    <span id="output-dir">{{ output_dir }}</span>

    <div class="container">
        <a href="/" class="back-link">← Back to Doodle Scanner</a>
        <h1>Camera Scan</h1>
        <p class="subtitle">Position camera over your book and flip pages</p>

        <div class="scanner-frame">
            <div class="camera-area">
                <img id="video-feed" src="/video_feed" alt="Camera Feed">

                <!-- Motion indicator -->
                <div class="motion-bar">
                    <div class="motion-level" id="motion-level" style="height: 20%"></div>
                </div>

                <!-- Status overlay -->
                <div class="status-bar">
                    <span class="status-text" id="status-text">Ready to scan</span>
                    <span class="page-count" id="page-count">0 pages</span>
                </div>
            </div>

            <!-- Main controls -->
            <div class="controls-area" id="controls-area">
                <button class="main-button btn-start" id="main-button" onclick="handleMainButton()">
                    Start Scanning
                </button>

                <div class="secondary-actions">
                    <a href="#" onclick="toggleSettings(); return false;">⚙ Settings</a>
                    <a href="#" onclick="newSession(); return false;">+ New Session</a>
                </div>
            </div>

            <!-- Settings (hidden by default) -->
            <div class="settings-panel" id="settings-panel">
                <h3>Settings</h3>
                <div class="setting-row">
                    <label>Sensitivity</label>
                    <input type="range" id="sensitivity" min="1" max="10" value="5" onchange="updateSensitivity(this.value)">
                    <span class="value" id="sensitivity-val">5</span>
                </div>
                <div class="setting-row">
                    <label>Capture Delay</label>
                    <input type="range" id="stability-delay" min="0.3" max="3" step="0.1" value="1.0" onchange="updateDelay(this.value)">
                    <span class="value" id="stability-delay-val">1.0s</span>
                </div>
                <div class="setting-row">
                    <label>Camera</label>
                    <select id="camera-select" onchange="switchCamera(this.value)">
                        <option value="">Loading...</option>
                    </select>
                </div>
            </div>

            <!-- Results (shown after OCR complete) -->
            <div class="results-panel" id="results-panel">
                <div class="results-icon">✓</div>
                <div class="results-title" id="results-title">OCR Complete</div>
                <div class="results-meta" id="results-meta">4 pages processed</div>
                <div class="results-actions">
                    <button class="results-btn" onclick="scanMore()">Scan More</button>
                    <a class="results-btn primary" id="download-link" href="#" target="_blank">Download Markdown</a>
                </div>
            </div>
        </div>
    </div>

    <script>
        // App state
        let appState = 'idle'; // idle, scanning, processing, done
        let isDetecting = false;
        let captureCount = 0;
        let ocrOutputUrl = null;

        // State machine: what the main button does
        function handleMainButton() {
            switch(appState) {
                case 'idle':
                    startScanning();
                    break;
                case 'scanning':
                    stopAndProcess();
                    break;
                case 'processing':
                    // Button is disabled during processing
                    break;
                case 'done':
                    scanMore();
                    break;
            }
        }

        function startScanning() {
            fetch('/toggle_detection', {method: 'POST'})
                .then(r => r.json())
                .then(data => {
                    if (data.active) {
                        isDetecting = true;
                        setAppState('scanning');
                    }
                });
        }

        function stopAndProcess() {
            // First stop scanning
            fetch('/toggle_detection', {method: 'POST'})
                .then(r => r.json())
                .then(() => {
                    isDetecting = false;
                    // Now run OCR
                    if (captureCount > 0) {
                        setAppState('processing');
                        runOCR();
                    } else {
                        setAppState('idle');
                    }
                });
        }

        function runOCR() {
            const sessionName = document.getElementById('session-name').textContent;

            fetch('/run_ocr', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session: sessionName})
            })
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    document.getElementById('status-text').textContent = 'OCR Error: ' + data.error;
                    document.getElementById('status-text').className = 'status-text error';
                    setAppState('idle');
                }
                // OCR started - status polling will track progress
            })
            .catch(err => {
                document.getElementById('status-text').textContent = 'OCR failed';
                document.getElementById('status-text').className = 'status-text error';
                setAppState('idle');
            });
        }

        function scanMore() {
            fetch('/new_session', {method: 'POST'})
                .then(r => r.json())
                .then(data => {
                    document.getElementById('session-name').textContent = data.session_name;
                    document.getElementById('output-dir').textContent = data.output_dir;
                    captureCount = 0;
                    ocrOutputUrl = null;
                    setAppState('idle');
                });
        }

        function newSession() {
            if (isDetecting) {
                fetch('/toggle_detection', {method: 'POST'}).then(() => {
                    isDetecting = false;
                    scanMore();
                });
            } else {
                scanMore();
            }
        }

        function setAppState(state) {
            appState = state;
            const btn = document.getElementById('main-button');
            const controlsArea = document.getElementById('controls-area');
            const resultsPanel = document.getElementById('results-panel');
            const statusText = document.getElementById('status-text');

            // Reset
            controlsArea.style.display = 'flex';
            resultsPanel.classList.remove('visible');
            btn.disabled = false;

            switch(state) {
                case 'idle':
                    btn.className = 'main-button btn-start';
                    btn.textContent = 'Start Scanning';
                    statusText.textContent = 'Ready to scan';
                    statusText.className = 'status-text';
                    break;

                case 'scanning':
                    btn.className = 'main-button btn-stop';
                    btn.textContent = 'Stop & Process';
                    statusText.textContent = 'Scanning...';
                    statusText.className = 'status-text scanning';
                    break;

                case 'processing':
                    btn.className = 'main-button btn-processing';
                    btn.textContent = 'Processing OCR...';
                    btn.disabled = true;
                    statusText.textContent = 'Running OCR...';
                    statusText.className = 'status-text processing';
                    break;

                case 'done':
                    controlsArea.style.display = 'none';
                    resultsPanel.classList.add('visible');
                    statusText.textContent = 'Complete';
                    statusText.className = 'status-text';
                    document.getElementById('results-meta').textContent = captureCount + ' pages processed';
                    if (ocrOutputUrl) {
                        document.getElementById('download-link').href = ocrOutputUrl;
                    }
                    break;
            }
        }

        function toggleSettings() {
            document.getElementById('settings-panel').classList.toggle('visible');
        }

        function loadCameras() {
            fetch('/list_cameras')
                .then(r => r.json())
                .then(data => {
                    const select = document.getElementById('camera-select');
                    select.innerHTML = data.cameras.map(i =>
                        `<option value="${i}" ${i === data.current ? 'selected' : ''}>Camera ${i}</option>`
                    ).join('');
                });
        }

        function switchCamera(index) {
            if (index === '') return;
            fetch('/set_camera', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({camera: parseInt(index)})
            }).then(() => {
                isDetecting = false;
                setAppState('idle');
                document.getElementById('video-feed').src = '/video_feed?' + Date.now();
            });
        }

        function updateSensitivity(value) {
            document.getElementById('sensitivity-val').textContent = value;
            const motionThreshold = 11 - value;
            const stabilityThreshold = 2.2 - (value * 0.2);

            fetch('/update_setting', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: 'motion_threshold', value: motionThreshold})
            });
            fetch('/update_setting', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: 'stability_threshold', value: stabilityThreshold})
            });
        }

        function updateDelay(value) {
            document.getElementById('stability-delay-val').textContent = value + 's';
            fetch('/update_setting', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: 'stability_delay', value: parseFloat(value)})
            });
        }

        // Poll for status updates
        let lastCount = 0;
        setInterval(() => {
            fetch('/status')
                .then(r => r.json())
                .then(data => {
                    captureCount = data.capture_count;
                    document.getElementById('page-count').textContent = captureCount + ' page' + (captureCount !== 1 ? 's' : '');

                    // Motion bar
                    const motionLevel = document.getElementById('motion-level');
                    const normalizedMotion = Math.min(100, (data.delta / 10) * 100);
                    motionLevel.style.height = normalizedMotion + '%';
                    motionLevel.classList.toggle('high', data.delta > data.motion_threshold);

                    // Update status text during scanning
                    if (appState === 'scanning') {
                        if (data.state === 'PAGE_TURNING') {
                            document.getElementById('status-text').textContent = 'Page turning...';
                            document.getElementById('status-text').className = 'status-text turning';
                        } else if (data.state === 'STABILIZING') {
                            document.getElementById('status-text').textContent = 'Stabilizing...';
                            document.getElementById('status-text').className = 'status-text turning';
                        } else {
                            document.getElementById('status-text').textContent = 'Scanning...';
                            document.getElementById('status-text').className = 'status-text scanning';
                        }
                    }

                    // Flash and sound on new capture
                    if (data.capture_count > lastCount) {
                        const flash = document.getElementById('capture-flash');
                        flash.style.display = 'block';
                        setTimeout(() => flash.style.display = 'none', 200);
                        try { document.getElementById('capture-sound').play(); } catch(e) {}

                        // Brief "Captured!" message
                        if (appState === 'scanning') {
                            document.getElementById('status-text').textContent = 'Captured!';
                            setTimeout(() => {
                                if (appState === 'scanning') {
                                    document.getElementById('status-text').textContent = 'Scanning...';
                                    document.getElementById('status-text').className = 'status-text scanning';
                                }
                            }, 1000);
                        }
                    }
                    lastCount = data.capture_count;

                    // Handle OCR status
                    if (data.ocr) {
                        if (data.ocr.state === 'running' && appState === 'processing') {
                            const total = data.ocr.total || 0;
                            const completed = data.ocr.completed || 0;
                            if (total > 0) {
                                document.getElementById('status-text').textContent =
                                    `OCR: ${completed}/${total} pages...`;
                            }
                        } else if (data.ocr.state === 'complete') {
                            if (appState === 'processing') {
                                ocrOutputUrl = data.ocr.output_url;
                                setAppState('done');
                            }
                        } else if (data.ocr.state === 'error' && appState === 'processing') {
                            document.getElementById('status-text').textContent =
                                'OCR Error: ' + (data.ocr.error || 'Unknown');
                            document.getElementById('status-text').className = 'status-text error';
                            setAppState('idle');
                        }
                    }
                });
        }, 500);

        // Initialize
        loadCameras();
        setAppState('idle');
    </script>
</body>
</html>
'''


@app.route('/')
def landing():
    """Landing page with two routes: Upload or Camera."""
    return render_template_string(LANDING_PAGE)


@app.route('/upload')
def upload_page():
    """PDF upload page."""
    return render_template_string(UPLOAD_PAGE)


@app.route('/camera')
def camera_page():
    """Camera scanning page (PageSnap)."""
    if not CAMERA_AVAILABLE:
        return render_template_string('''
        <!DOCTYPE html><html><head><title>Camera Not Available</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Camera Mode Not Available</h1>
            <p>Camera scanning requires OpenCV which is only available when running locally.</p>
            <p><a href="/upload">Use PDF Upload instead →</a></p>
        </body></html>
        ''')
    return render_template_string(HTML_TEMPLATE,
                                  session_name=page_snap.session_name,
                                  output_dir=page_snap.output_dir,
                                  current_camera=page_snap.camera_index)


@app.route('/list_cameras')
def list_cameras():
    if not CAMERA_AVAILABLE:
        return jsonify({'cameras': [], 'current': 0, 'error': 'Camera not available'})
    cameras = []
    for i in range(5):
        cap = cv2.VideoCapture(i, cv2.CAP_AVFOUNDATION)
        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                cameras.append(i)
            cap.release()
    return jsonify({'cameras': cameras, 'current': page_snap.camera_index})


@app.route('/set_camera', methods=['POST'])
def set_camera():
    data = request.json
    new_index = int(data['camera'])
    with page_snap.lock:
        page_snap.detection_active = False
        if page_snap.cap:
            page_snap.cap.release()
            page_snap.cap = None
        page_snap.camera_index = new_index
        page_snap.detector.reset()
    return jsonify({'ok': True, 'camera': new_index})


@app.route('/video_feed')
def video_feed():
    return Response(page_snap.generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/toggle_detection', methods=['POST'])
def toggle_detection():
    with page_snap.lock:
        page_snap.detection_active = not page_snap.detection_active
        if page_snap.detection_active:
            page_snap.detector.reset()
            page_snap.reset_ocr_status()  # Clear stale OCR status when starting
    return jsonify({'active': page_snap.detection_active})


@app.route('/set_roi', methods=['POST'])
def set_roi():
    data = request.json
    with page_snap.lock:
        page_snap.roi = (data['x'], data['y'], data['w'], data['h'])
    return jsonify({'ok': True})


@app.route('/clear_roi', methods=['POST'])
def clear_roi():
    with page_snap.lock:
        page_snap.roi = None
    return jsonify({'ok': True})


@app.route('/new_session', methods=['POST'])
def new_session():
    with page_snap.lock:
        page_snap.detection_active = False  # Stop detection
        page_snap.session_name = datetime.now().strftime("%Y%m%d_%H%M%S")
        page_snap.output_dir = os.path.join(os.path.dirname(__file__), "sessions", page_snap.session_name)
        os.makedirs(page_snap.output_dir, exist_ok=True)
        page_snap.capture_count = 0
        page_snap.detector.reset()
        page_snap.reset_ocr_status()
    return jsonify({'session_name': page_snap.session_name, 'output_dir': page_snap.output_dir, 'detection_stopped': True})


@app.route('/update_setting', methods=['POST'])
def update_setting():
    data = request.json
    with page_snap.lock:
        setattr(page_snap.config, data['name'], data['value'])
        page_snap.detector.config = page_snap.config
    return jsonify({'ok': True})


@app.route('/status')
def status():
    with page_snap.lock:
        ocr_status = dict(page_snap.ocr_status)
        capture_count = page_snap.capture_count
        detection_active = page_snap.detection_active
        state_value = page_snap.detector.state.value
        last_delta = round(page_snap.detector.last_delta, 1)
        motion_threshold = page_snap.config.motion_threshold
        stability_threshold = page_snap.config.stability_threshold

    if ocr_status.get('output') and ocr_status.get('session') and os.path.exists(ocr_status['output']):
        ocr_status['output_url'] = url_for('session_ocr', session_name=ocr_status['session'])

    return jsonify({
        'capture_count': capture_count,
        'detection_active': detection_active,
        'state': state_value,
        'delta': last_delta,
        'motion_threshold': motion_threshold,
        'stability_threshold': stability_threshold,
        'ocr': ocr_status
    })


@app.route('/list_sessions')
def list_sessions():
    """List all available sessions."""
    sessions_dir = os.path.join(os.path.dirname(__file__), "sessions")
    sessions = []
    if os.path.exists(sessions_dir):
        for name in sorted(os.listdir(sessions_dir), reverse=True):
            session_path = os.path.join(sessions_dir, name)
            if os.path.isdir(session_path):
                images = [f for f in os.listdir(session_path) if f.endswith('.jpg')]
                sessions.append({
                    'name': name,
                    'image_count': len(images),
                    'has_ocr': os.path.exists(os.path.join(session_path, f"{name}_ocr.md"))
                })
    return jsonify({'sessions': sessions, 'current': page_snap.session_name})


@app.route('/run_ocr', methods=['POST'])
def run_ocr():
    """Run OCR on a session using Gemini 2.0 Flash."""
    data = request.json or {}
    session_name = data.get('session') or page_snap.session_name

    started, error = page_snap.trigger_ocr(session_name)
    if error:
        code = 404 if "Session not found" in error else 409 if "already running" in error else 400
        return jsonify({'error': error}), code

    return jsonify({'ok': True})


@app.route('/session_ocr/<session_name>')
def session_ocr(session_name):
    """Serve the OCR markdown for a session."""
    session_path = os.path.join(os.path.dirname(__file__), "sessions", session_name)
    md_path = os.path.join(session_path, f"{session_name}_ocr.md")

    if not os.path.exists(md_path):
        return jsonify({'error': 'OCR output not found'}), 404

    return send_file(md_path, mimetype='text/markdown', download_name=f"{session_name}_ocr.md")


@app.route('/export_pdf', methods=['POST'])
def export_pdf():
    """Export session images as a single PDF."""
    data = request.json
    session_name = data.get('session', page_snap.session_name)
    session_path = os.path.join(os.path.dirname(__file__), "sessions", session_name)

    if not os.path.exists(session_path):
        return jsonify({'error': f'Session not found: {session_name}'}), 404

    # Get all images sorted by name
    images = sorted([f for f in os.listdir(session_path) if f.endswith('.jpg')])
    if not images:
        return jsonify({'error': 'No images in session'}), 400

    try:
        from PIL import Image

        # Load all images and convert to RGB
        image_list = []
        for img_name in images:
            img_path = os.path.join(session_path, img_name)
            img = Image.open(img_path).convert('RGB')
            image_list.append(img)

        # Create PDF
        pdf_path = os.path.join(session_path, f"{session_name}.pdf")
        if len(image_list) > 0:
            image_list[0].save(
                pdf_path,
                save_all=True,
                append_images=image_list[1:] if len(image_list) > 1 else [],
                resolution=100.0
            )

        return jsonify({
            'ok': True,
            'output': pdf_path,
            'page_count': len(images)
        })
    except ImportError:
        return jsonify({'error': 'Pillow not installed. Run: pip install Pillow'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/download_pdf/<session_name>')
def download_pdf(session_name):
    """Download the PDF for a session."""
    session_path = os.path.join(os.path.dirname(__file__), "sessions", session_name)
    pdf_path = os.path.join(session_path, f"{session_name}.pdf")

    if not os.path.exists(pdf_path):
        return jsonify({'error': 'PDF not found. Export first.'}), 404

    return send_file(pdf_path, as_attachment=True, download_name=f"{session_name}.pdf")


# ============================================================================
# PDF Upload API
# ============================================================================

@app.route('/api/upload', methods=['POST'])
def api_upload():
    """Upload a PDF for OCR processing."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Only PDF files are supported'}), 400

    # Save file
    filename = secure_filename(file.filename)
    file_path = os.path.join(pdf_manager.upload_dir, f"{uuid.uuid4().hex[:8]}_{filename}")
    file.save(file_path)

    # Get page count
    try:
        from pdf_pipeline import get_pdf_info
        pdf_info = get_pdf_info(file_path)
        page_count = pdf_info['page_count']
    except Exception as e:
        os.remove(file_path)
        return jsonify({'error': f'Invalid PDF: {e}'}), 400

    # Create job
    job_id = pdf_manager.create_job(filename, file_path, page_count)

    return jsonify({
        'ok': True,
        'job_id': job_id,
        'filename': filename,
        'page_count': page_count
    })


@app.route('/api/jobs')
def api_list_jobs():
    """List all PDF processing jobs."""
    return jsonify({'jobs': pdf_manager.list_jobs()})


@app.route('/api/jobs/<job_id>')
def api_get_job(job_id):
    """Get status of a specific job."""
    job = pdf_manager.get_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)


@app.route('/api/jobs/<job_id>/analyze', methods=['POST'])
def api_analyze_job(job_id):
    """Run pre-flight analysis on a PDF job."""
    success, error = pdf_manager.analyze_job(job_id)
    if not success:
        return jsonify({'error': error}), 400
    return jsonify({'ok': True})


@app.route('/api/jobs/<job_id>/start', methods=['POST'])
def api_start_job(job_id):
    """Start processing a PDF job with optional preferences."""
    data = request.json or {}
    preferences = data.get('preferences')
    success, error = pdf_manager.start_processing(job_id, preferences=preferences)
    if not success:
        return jsonify({'error': error}), 400
    return jsonify({'ok': True})


@app.route('/api/jobs/<job_id>/cancel', methods=['POST'])
def api_cancel_job(job_id):
    """Cancel a stuck or processing job."""
    job = pdf_manager.get_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    if job['status'] in ('complete', 'error'):
        return jsonify({'error': f"Job already {job['status']}"}), 400

    pdf_manager.update_job(
        job_id,
        status='error',
        error='Cancelled by user',
        completed_at=datetime.now().isoformat()
    )
    return jsonify({'ok': True})


@app.route('/api/jobs/<job_id>/download')
def api_download_job(job_id):
    """Download the OCR output for a completed job."""
    job = pdf_manager.get_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    if job['status'] != 'complete' or not job.get('output_path'):
        return jsonify({'error': 'Job not complete'}), 400

    if not os.path.exists(job['output_path']):
        return jsonify({'error': 'Output file not found'}), 404

    return send_file(
        job['output_path'],
        as_attachment=True,
        download_name=f"{Path(job['filename']).stem}_ocr.md"
    )


if __name__ == '__main__':
    import argparse
    import os

    parser = argparse.ArgumentParser()
    parser.add_argument('-c', '--camera', type=int, default=0)
    parser.add_argument('-p', '--port', type=int, default=int(os.environ.get('PORT', 5001)))
    args = parser.parse_args()

    print(f"\nDoodle Scanner")
    print(f"==============")
    if CAMERA_AVAILABLE and page_snap:
        page_snap.camera_index = args.camera
        print(f"Camera: {args.camera}")
    else:
        print("Camera: Not available (PDF upload only)")
    print(f"Port: {args.port}")
    if args.port == 5001:
        print(f"Open http://localhost:{args.port} in your browser")
    print()

    app.run(host='0.0.0.0', port=args.port, debug=False, threaded=True)
