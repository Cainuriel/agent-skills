#!/usr/bin/env node
// Local server for the signing page. Node.js built-in modules only.
// - Listens on 127.0.0.1 only: the page is not reachable from the network.
// - Serves three fixed files. No directory listing, no other path.
// - Strict Content-Security-Policy: no external script, style, image or network connection.
// - Rejects requests whose Host header is not this server (protection against DNS rebinding).
//
// Usage: node tools/release/sign/serve.mjs [port]   (default 8735). Stop with Ctrl+C.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 8735);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('Port must be an integer between 1024 and 65535.');
  process.exit(2);
}

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/sign.js': ['sign.js', 'text/javascript; charset=utf-8'],
  '/sign.css': ['sign.css', 'text/css; charset=utf-8'],
};

const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const server = http.createServer((req, res) => {
  if (!allowedHosts.has(req.headers.host ?? '')) {
    res.writeHead(421, HEADERS).end('Misdirected request');
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405, HEADERS).end('Method not allowed');
    return;
  }
  const entry = FILES[new URL(req.url, 'http://127.0.0.1').pathname];
  if (!entry) {
    res.writeHead(404, HEADERS).end('Not found');
    return;
  }
  const [file, type] = entry;
  res.writeHead(200, { ...HEADERS, 'Content-Type': type });
  res.end(fs.readFileSync(path.join(dir, file)));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Signing page: http://127.0.0.1:${port}/`);
  console.log('Listening on 127.0.0.1 only. Stop with Ctrl+C after signing.');
});
