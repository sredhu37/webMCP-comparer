// PROTOTYPE: throwaway demo shop server. Serves index.html for every page route.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const port = Number(process.env.PORT ?? 4000);
const html = () => readFileSync(new URL('./index.html', import.meta.url));

createServer((req, res) => {
  if (req.url === '/favicon.ico') return res.writeHead(204).end();
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html());
}).listen(port, () => console.log(`Demo shop prototype on http://localhost:${port}`));
