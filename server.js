const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

const ROUTES = {
  '/':           '/app/login.html',
  '/login':      '/app/login.html',
  '/login.html': '/app/login.html',
  '/app':        '/app/index.html',
  '/app/':       '/app/index.html',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  const mapped = ROUTES[urlPath];
  if (mapped) urlPath = mapped;

  const filePath = path.join(ROOT, urlPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + urlPath);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('ProveLink corriendo en http://localhost:' + PORT);
});
