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

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];

  // /bill/:id — serve OG page so iMessage generates rich preview, then redirect to backend
  if (path.startsWith('/bill/')) {
    const backendUrl = BACKEND + req.url;
    return serveOGPage(res,
      '🪶 RAVEN — You\'ve been spotted',
      'Tap to see what you owe and pay your share.',
      backendUrl
    );
  }

  // /trip/:id — proxy to backend (already has its own HTML page)
  if (path.startsWith('/trip/')) {
    return proxyToBackend(req, res);
  }

  // /friend-invite/:id — serve OG page then redirect to backend
  if (path.startsWith('/friend-invite/')) {
    const backendUrl = BACKEND + req.url;
    return serveOGPage(res,
      '🪶 RAVEN — Friend Invite',
      'Someone wants to connect with you on RAVEN. Split bills free.',
      backendUrl
    );
  }

  // API routes → proxy to backend
  const PROXY_PATHS = ['/sms', '/waitlist', '/remind', '/ping', '/demo', '/gif-search', '/trip-info'];
  if (PROXY_PATHS.some(p => path.startsWith(p))) {
    return proxyToBackend(req, res);
  }

  // Everything else → serve static files from raven-site
  serveHandler(req, res, { public: '.', cleanUrls: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🪶 RAVEN proxy running on port ${PORT}`));
