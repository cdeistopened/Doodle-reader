#!/usr/bin/env node

/**
 * Local RSS Proxy Server
 *
 * Some podcast feeds (like Megaphone) block public CORS proxies.
 * This runs locally and fetches feeds directly without CORS issues.
 *
 * Usage:
 *   node rss-proxy.js          # Runs on port 3002
 *
 * Fetch a feed:
 *   curl "http://localhost:3002/feed?url=https://feeds.megaphone.fm/HS2300184645"
 */

import http from 'http';

const PORT = 3002;

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/feed') {
    const feedUrl = url.searchParams.get('url');

    if (!feedUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    try {
      console.log(`[RSS Proxy] Fetching: ${feedUrl}`);

      const response = await fetch(feedUrl, {
        headers: {
          // Mimic a real podcast app / browser
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        }
      });

      if (!response.ok) {
        throw new Error(`Upstream returned ${response.status}`);
      }

      const content = await response.text();

      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8'
      });
      res.end(content);

      console.log(`[RSS Proxy] Success: ${feedUrl} (${content.length} bytes)`);

    } catch (error) {
      console.error(`[RSS Proxy] Error fetching ${feedUrl}:`, error.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Health check / info
  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'rss-proxy',
      usage: 'GET /feed?url=<feed_url>'
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🔗 RSS Proxy running at http://localhost:${PORT}`);
  console.log(`   Usage: http://localhost:${PORT}/feed?url=<feed_url>`);
});
