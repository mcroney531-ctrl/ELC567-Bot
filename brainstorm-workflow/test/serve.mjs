/* Local preview:  npm start  ->  http://127.0.0.1:8080
 *
 * A server rather than opening index.html directly: Chromium gives a file://
 * page no localStorage, and without that the activity cannot save anything.
 *
 *   /                 the activity
 *   /role/<name>      one slice of it, for working on a stage in isolation
 *   /frames/<a,b,c>   several slices side by side on one origin
 */
import { serveSite } from './helpers.mjs';

const port = Number(process.env.PORT || 8080);
await serveSite(port);
console.log('Activity:  http://127.0.0.1:' + port + '/');
console.log('One slice: http://127.0.0.1:' + port + '/role/coach-workflow');
console.log('\nCtrl+C to stop.');
