const http = require('http');
const fs = require('fs');
const path = require('path');

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

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if(error.code == 'ENOENT') {
        // SPA Fallback: Serve index.html for unknown paths that don't look like assets
        if (!extname || extname === '.html') {
             fs.readFile(STATIC_DIR + '/index.html', (err, html) => {
                 if (err) {
                     res.writeHead(500);
                     res.end('Error loading index.html');
                 } else {
                     res.writeHead(200, { 'Content-Type': 'text/html' });
                     res.end(html, 'utf-8');
                 }
             });
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});