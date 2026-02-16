/**
 * Minimal static server for the job application form.
 * Run: npm start
 */
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

const server = createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url;
  const file = join(publicDir, path);

  try {
    const data = readFileSync(file);
    const ext = extname(file);
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    res.end(data);
  } catch (err) {
    res.statusCode = 404;
    res.end('Not found');
  }
});

const port = 8765;
server.listen(port, () => {
  console.log(`Server at http://localhost:${port}`);
});
