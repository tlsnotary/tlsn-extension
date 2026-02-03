const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8888;
const DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
};

const server = http.createServer((req, res) => {
  // Set COOP/COEP headers for SharedArrayBuffer support
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let filePath = path.join(DIR, req.url === '/' ? 'index.html' : req.url);

  // Handle paths without extension
  if (!path.extname(filePath)) {
    filePath += '.html';
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log(`[Server] 404: ${req.url}`);
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    console.log(`[Server] 200: ${req.url} (${contentType})`);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[Server] TLSN Prover server running at http://localhost:${PORT}`);
  console.log(`[Server] COOP/COEP headers enabled for SharedArrayBuffer support`);
});
