import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;

// Serve from dist/ in production (after vite build)
const STATIC_DIR = fs.existsSync('./dist') ? './dist' : '.';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  // Newsletter Creation Proxy - bypasses CORS for kill-the-newsletter.com
  if (req.url === '/api/newsletter' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { name } = JSON.parse(body);
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing name parameter' }));
          return;
        }

        console.log(`[Newsletter Proxy] Creating feed: ${name}`);
        const formData = new URLSearchParams();
        formData.append('title', name);

        const response = await fetch('https://kill-the-newsletter.com/feeds', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
          body: formData.toString(),
        });

        if (!response.ok) {
          throw new Error(`Upstream returned ${response.status}`);
        }

        const html = await response.text();

        // Extract the publicId from the feed URL
        const feedUrlMatch = html.match(/https:\/\/kill-the-newsletter\.com\/feeds\/([a-z0-9]+)\.xml/i);
        if (!feedUrlMatch) {
          throw new Error('Failed to parse feed URL from response');
        }

        const publicId = feedUrlMatch[1];
        const result = {
          email: `${publicId}@kill-the-newsletter.com`,
          feedUrl: `https://kill-the-newsletter.com/feeds/${publicId}.xml`,
        };

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(result));
        console.log(`[Newsletter Proxy] Success: ${result.email}`);
      } catch (error) {
        console.error(`[Newsletter Proxy] Error:`, error.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Handle CORS preflight for newsletter endpoint
  if (req.url === '/api/newsletter' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // RSS Feed Proxy - bypasses CORS for blocked feeds like Megaphone
  if (req.url.startsWith('/api/feed?')) {
    const urlParam = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('url');
    if (!urlParam) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    try {
      console.log(`[RSS Proxy] Fetching: ${urlParam}`);
      const response = await fetch(urlParam, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        }
      });

      if (!response.ok) {
        throw new Error(`Upstream returned ${response.status}`);
      }

      const content = await response.text();
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
      console.log(`[RSS Proxy] Success: ${urlParam} (${content.length} bytes)`);
    } catch (error) {
      console.error(`[RSS Proxy] Error:`, error.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  let filePath = STATIC_DIR + req.url;
  if (filePath === STATIC_DIR + '/') {
    filePath = STATIC_DIR + '/index.html';
  }

  // Remove query params for file lookup
  const q = filePath.indexOf('?');
  if (q !== -1) {
    filePath = filePath.substring(0, q);
  }

  const extname = path.extname(filePath);
  let contentType = MIME_TYPES[extname] || 'application/octet-stream';

  // Helper to serve index.html for SPA routing
  const serveIndex = () => {
    fs.readFile(STATIC_DIR + '/index.html', (err, html) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html, 'utf-8');
      }
    });
  };

  // Check if path exists and is a file (not directory)
  fs.stat(filePath, (statErr, stats) => {
    // If path doesn't exist or is a directory, handle as SPA route
    if (statErr || stats.isDirectory()) {
      // For paths without extension or .html, serve index.html (SPA routing)
      if (!extname || extname === '.html') {
        serveIndex();
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
      return;
    }

    // Path exists and is a file - serve it
    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
