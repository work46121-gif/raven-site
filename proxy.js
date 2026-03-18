const http = require('http');
const https = require('https');
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

function serveOGPage(res, title, description, redirectUrl, imageUrl) {
  const img = imageUrl || 'https://ravensplit.com/raven-hero.png';
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${redirectUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="RAVEN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${img}">
  <script>window.location.replace('${redirectUrl}');</script>
</head>
<body style="background:#06060A;color:#F0EEF8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;margin:0">
  <div>
    <div style="font-size:56px;margin-bottom:16px">🪶</div>
    <div style="font-size:22px;font-weight:700;margin-bottom:8px">${title}</div>
    <div style="font-size:15px;color:#9896A8">${description}</div>
  </div>
</body>
</html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://ffjpzkpdumdcwnakpaje.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmanB6a3BkdW1kY3duYWtwYWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4OTcsImV4cCI6MjA4ODU2Mzg5N30.JtDLVu4K1TJ8emcN_mvSHBu6e0y8-jPQv-ypoc9p0RU';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];

  // /bill/:id — fetch bill name from Supabase, serve OG page with bill name in title
  if (path.startsWith('/bill/')) {
    const billId = path.split('/')[2] || '';
    const backendUrl = BACKEND + req.url;
    let billName = 'Your Bill';
    try {
      const { data } = await db.from('bills').select('name').eq('id', billId).single();
      if (data?.name) billName = data.name;
    } catch(e) {}
    return serveOGPage(res,
      `🪶 ${billName} — Split bills free with RAVEN`,
      'Tap to see what you owe and pay your share. | ravensplit.com',
      backendUrl
    );
  }

  // /trip/:id — fetch trip name + cover image, serve OG page with cover photo
  if (path.startsWith('/trip/')) {
    const tripId = path.split('/')[2] || '';
    // Check if this is an API call (has action param) → proxy to backend
    if (req.url.includes('action=')) return proxyToBackend(req, res);
    const backendUrl = BACKEND + req.url;
    let tripName = 'Trip Hub';
    let coverImage = null;
    try {
      const { data } = await db.from('trips').select('name, cover_image').eq('id', tripId).single();
      if (data?.name) tripName = data.name;
      if (data?.cover_image) {
        // cover_image is base64 — serve OG page pointing to raven-hero as fallback
        // iMessage can't load base64 OG images, so we use raven-hero but name from DB
        coverImage = null; // base64 not usable in OG tags
      }
    } catch(e) {}
    return serveOGPage(res,
      `✈️ Join ${tripName} on RAVEN`,
      'Split bills free with RAVEN | ravensplit.com',
      backendUrl
    );
  }

  // /friend-invite/:id — serve OG page with friend invite messaging
  if (path.startsWith('/friend-invite/')) {
    const ravenId = path.split('/')[2] || '';
    const backendUrl = BACKEND + req.url;
    let firstName = ravenId;
    try {
      const { data } = await db.from('profiles').select('first_name').eq('raven_id', ravenId).single();
      if (data?.first_name) firstName = data.first_name;
    } catch(e) {}
    return serveOGPage(res,
      `🪶 ${firstName} wants to be your friend on RAVEN — Split bills free with RAVEN | ravensplit.com`,
      'Split bills free with RAVEN | ravensplit.com',
      backendUrl
    );
  }

  // API routes → proxy to backend
  const PROXY_PATHS = ['/sms', '/waitlist', '/remind', '/ping', '/demo', '/gif-search', '/trip-info'];
  if (PROXY_PATHS.some(p => path.startsWith(p))) {
    return proxyToBackend(req, res);
  }

  // Everything else → serve static files
  serveHandler(req, res, { public: '.', cleanUrls: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🪶 RAVEN proxy running on port ${PORT}`));
