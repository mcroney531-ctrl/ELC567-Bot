/* Local preview server for dist/.
 *
 *   npm run preview     builds everything, then serves it here
 *
 * A server rather than file:// because Chromium gives a file:// page no
 * localStorage, and without localStorage the blocks cannot see each other.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 8080);

http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'preview.html';
  const file = path.join(DIST, path.basename(name));
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not in dist/: ' + name + '\n\nRun npm run build first.');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(file));
}).listen(port, () => {
  console.log('Lesson builder:       http://127.0.0.1:' + port + '/builder.html');
  console.log('Plain nine-block:     http://127.0.0.1:' + port + '/');
  console.log('One block on its own: http://127.0.0.1:' + port + '/3-coach-workflow.html');
  console.log('Storage probe:        http://127.0.0.1:' + port + '/rise-storage-probe.html');
  console.log('\nCtrl+C to stop.');
});
