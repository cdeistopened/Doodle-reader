const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

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
  '.ts': 'text/plain', 
  '.tsx': 'text/plain'
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
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
             fs.readFile('./index.html', (err, html) => {
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