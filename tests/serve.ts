// Serveur statique minimal pour prévisualiser site/ en local : npm run serve [-- <dossier>]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'site');
const port = Number(process.env.PORT ?? 8080);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  // Sans ce type, les icônes de icons.svg (<use href="icons.svg#…">) ne s'affichent pas.
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname));
  const file = join(root, path.endsWith('/') || path.endsWith('\\') ? join(path, 'index.html') : path);
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    response.writeHead(404).end('Introuvable');
  }
}).listen(port, () => console.log(`http://localhost:${port}/ (${root})`));
