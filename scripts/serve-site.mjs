// Local preview of the combined static site (site/): files as-is, SPA fallback for /app/*.
// Usage: node scripts/serve-site.mjs [port]   (no dependencies)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const port = Number(process.argv[2] ?? 4320);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.map': 'application/json', '.txt': 'text/plain',
};

async function file(path) {
  try {
    const s = await stat(path);
    return s.isDirectory() ? file(join(path, 'index.html')) : path;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let path = await file(join(root, rel));
  if (!path && url.pathname.startsWith('/app')) path = join(root, 'app', 'index.html');
  if (!path) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(await readFile(path));
}).listen(port, () => console.log(`site/ on http://localhost:${port}  (app: /app/)`));
