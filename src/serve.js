#!/usr/bin/env node
// Enkel lokal server för public/:  node src/serve.js [port]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.argv[2] || 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(dir, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': (types[extname(path)] || 'text/html') + '; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Hittades inte');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
