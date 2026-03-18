const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const serveHandler = require('serve-handler');

const BACKEND = 'https://raven-backend-production-fb1f.up.railway.app';

function proxyToBackend(req, res) {
  const url = new URL(BACKEND + req.url);
  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers, host: url.hostname },
  };
  const proxyReq = https.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => { res.writeHead(502); res.end('Bad gateway'); });
  req.pipe(proxyReq);
}

function serveOGPage(res, title, description, redirectUrl) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="https://ravensplit.com/raven-hero.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${redirectUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="RAVEN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://ravensplit.com/raven-hero.png">
  <script>window.location.replace('${redirectUrl}');</script>
</head>
<body style="background:#06060A;color:#F0EEF8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;margin:0">
  <div><div style="font-size:56px;margin-bottom:16px">🪶</div><div style="font-size:22px;font-weight:700">${title}</div></div>
</body>
</html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveStaticFile(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.gif': 'image/gif', '.webp': 'image/webp' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://ffjpzkpdumdcwnakpaje.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmanB6a3BkdW1kY3duYWtwYWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4OTcsImV4cCI6MjA4ODU2Mzg5N30.JtDLVu4K1TJ8emcN_mvSHBu6e0y8-jPQv-ypoc9p0RU'
);

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // /bill/:id — OG preview page
  if (urlPath.startsWith('/bill/')) {
    const billId = urlPath.split('/')[2] || '';
    const backendUrl = BACKEND + req.url;
    let billName = 'Your Bill';
    try {
      const { data } = await db.from('bills').select('name').eq('id', billId).single();
      if (data?.name) billName = data.name;
    } catch(e) {}
    return serveOGPage(res, `🪶 ${billName} — Split bills free with RAVEN`, 'Tap to see what you owe and pay your share.', backendUrl);
  }

  // /trip/:id — OG preview then redirect to backend
  if (urlPath.startsWith('/trip/')) {
    if (req.url.includes('action=')) return proxyToBackend(req, res);
    const tripId = urlPath.split('/')[2] || '';
    const backendUrl = BACKEND + req.url;
    let tripName = 'Trip Hub';
    try {
      const { data } = await db.from('trips').select('name').eq('id', tripId).single();
      if (data?.name) tripName = data.name;
    } catch(e) {}
    return serveOGPage(res, `✈️ Join ${tripName} on RAVEN`, 'Split bills free with RAVEN | ravensplit.com', backendUrl);
  }

  // /friend-invite/:id — OG preview page
  if (urlPath.startsWith('/friend-invite/')) {
    const ravenId = urlPath.split('/')[2] || '';
    const backendUrl = BACKEND + req.url;
    let firstName = ravenId;
    try {
      const { data } = await db.from('profiles').select('first_name').eq('raven_id', ravenId).single();
      if (data?.first_name) firstName = data.first_name;
    } catch(e) {}
    return serveOGPage(res, `🪶 ${firstName} wants to be your friend on RAVEN`, 'Split bills free with RAVEN | ravensplit.com', backendUrl);
  }

  // API routes → proxy to backend
  const PROXY_PATHS = ['/sms', '/waitlist', '/remind', '/ping', '/demo/', '/demo/scan', '/gif-search', '/trip-info'];
  if (PROXY_PATHS.some(p => urlPath.startsWith(p))) {
    return proxyToBackend(req, res);
  }

  // Static files — handle manually
  // / → index.html
  // /dashboard → dashboard.html
  // /demo-bill.html → demo-bill.html (explicit .html)
  // /raven-hero.png → raven-hero.png etc
  // Serve static files
  if (urlPath === '/') {
    return serveStaticFile(req, res, './index.html');
  }

  // Has extension — serve directly
  if (path.extname(urlPath)) {
    const filePath = '.' + urlPath;
    if (fs.existsSync(filePath)) return serveStaticFile(req, res, filePath);
    // Try without the extension as a folder/clean URL fallback
    const noExtPath = '.' + urlPath.replace(/\.html$/, '') + '.html';
    if (fs.existsSync(noExtPath)) return serveStaticFile(req, res, noExtPath);
    // Fall through to serve-handler for assets
    return serveHandler(req, res, { public: '.', directoryListing: false });
  }

  // No extension — try as .html file (e.g. /dashboard → dashboard.html)
  const htmlPath = '.' + urlPath + '.html';
  if (fs.existsSync(htmlPath)) {
    return serveStaticFile(req, res, htmlPath);
  }

  // Final fallback
  serveStaticFile(req, res, './index.html');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🪶 RAVEN proxy running on port ${PORT}`));
