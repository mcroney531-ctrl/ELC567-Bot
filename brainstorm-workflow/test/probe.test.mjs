/*
 * Verifies the Rise storage probe itself: that it reports SHARED between
 * same-origin iframes and BLOCKED inside a sandboxed one, so its verdict in
 * Rise can be trusted.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const probe = fs.readFileSync(path.join(HERE, '..', 'tools', 'rise-storage-probe.html'), 'utf8');
const enc = probe.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Rise stacks blocks on ONE scrolling page, each in its own iframe.
const page = (sandbox) => `<!doctype html><title>host</title><body>
<h1>Lesson</h1>
<iframe id="a" style="width:700px;height:520px;border:1px solid #ccc" ${sandbox} srcdoc="${enc}"></iframe>
<p>some Rise text between the blocks</p>
<iframe id="b" style="width:700px;height:520px;border:1px solid #ccc" ${sandbox} srcdoc="${enc}"></iframe>
</body>`;

let mode = '';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(page(mode));
});
await new Promise(r => server.listen(8123, r));

const chromium = await loadChromium();
const browser = await chromium.launch();
const fails = [], ok = [];
const check = (n, c, x = '') => (c ? ok : fails).push(n + (c ? '' : ' :: ' + x));

async function run(label, sandboxAttr) {
  mode = sandboxAttr;
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8123/');
  await p.waitForTimeout(600);
  const fa = p.frameLocator('#a'), fb = p.frameLocator('#b');
  await fa.locator('#p-write').click();
  await p.waitForTimeout(300);
  await fb.locator('#p-refresh').click();
  await p.waitForTimeout(300);
  const va = await fa.locator('#p-verdict').textContent();
  const vb = await fb.locator('#p-verdict').textContent();
  const ls = await fa.locator('#p-ls').textContent();
  const events = await fb.locator('#p-events').textContent();
  const marks = await fb.locator('#p-marks').textContent();
  await ctx.close();
  return { va, vb, ls, events, marks };
}

// Case 1: same-origin iframes (state CAN be shared)
const shared = await run('same-origin', '');
check('same-origin: storage works', shared.ls === 'works', shared.ls);
check('same-origin: block A verdict SHARED', shared.va.includes('SHARED'), shared.va.trim().slice(0, 90));
check('same-origin: block B verdict SHARED', shared.vb.includes('SHARED'), shared.vb.trim().slice(0, 90));
check('same-origin: B lists both blocks', (shared.marks.match(/block/g) || []).length === 2, shared.marks.trim());
check('same-origin: B saw a live storage event', Number(shared.events) > 0, 'events=' + shared.events);

// Case 2: sandboxed without allow-same-origin (state CANNOT be shared)
const blocked = await run('sandboxed', 'sandbox="allow-scripts"');
check('sandboxed: storage reported blocked', blocked.ls.startsWith('BLOCKED'), blocked.ls);
check('sandboxed: verdict says BLOCKED', blocked.va.includes('BLOCKED'), blocked.va.trim().slice(0, 90));
check('sandboxed: probe did not crash', blocked.vb.length > 0);

console.log('probe: passed ' + ok.length + ' / ' + (ok.length + fails.length));
if (fails.length) console.log('\nFAILURES:\n  ' + fails.join('\n  '));
console.log('\n-- same-origin verdict --\n' + shared.va.trim());
console.log('-- sandboxed verdict --\n' + blocked.va.trim());
await browser.close(); server.close();
process.exit(fails.length ? 1 : 0);
