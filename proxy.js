const http = require('http');
const httpProxy = require('http-proxy');
const serveHandler = require('serve-handler');

const BACKEND = 'https://raven-backend-production-fb1f.up.railway.app';
const proxy = httpProxy.createProxyServer({ changeOrigin: true });

const PROXY_PATHS = ['/bill/', '/trip/', '/sms', '/waitlist', '/remind', '/ping', '/demo'];

const server = http.createServer((req, res) => {
  const shouldProxy = PROXY_PATHS.some(p => req.url.startsWith(p));
  if (shouldProxy) {
    proxy.web(req, res, { target: BACKEND });
  } else {
    serveHandler(req, res, { public: '.', cleanUrls: true });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🪶 RAVEN proxy running on port ${PORT}`));
