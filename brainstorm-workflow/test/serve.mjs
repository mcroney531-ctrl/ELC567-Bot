/* Local preview: node test/serve.mjs, then open http://127.0.0.1:8080
   (needed because localStorage is unavailable on file:// in Chromium). */
import { serveHtml, readActivity } from './helpers.mjs';
const port = Number(process.env.PORT || 8080);
await serveHtml(readActivity(), port);
console.log('Activity on http://127.0.0.1:' + port + '  (Ctrl+C to stop)');
