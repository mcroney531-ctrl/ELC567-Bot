/*
 * Release hardening, the things a deploy to a public project site depends on.
 *
 *   - Start leaves a clean console. startActivity() used to animate #bw-rail-fill,
 *     an element the Journey no longer has, so every Start logged GSAP "target not
 *     found" warnings that no error-only watcher would ever have caught.
 *   - Admin mode is a local review harness. ?admin=1 activates on localhost,
 *     127.0.0.1 and ::1 only; on any other hostname it builds no toolbar and
 *     unlocks and fills nothing. This is not a security boundary - there is no
 *     client-side secret that could be one - it is that the public URL does not
 *     hand every learner a button that completes the journey for them.
 *   - There is no public /admin/ redirect, and a .nojekyll at the root.
 *   - The site serves from a subpath (https://<user>.github.io/ELC567-Bot/): every
 *     asset index.html names is a relative path that resolves there.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { serveSite, makeReporter, loadChromium, ROOT } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('release hardening');
const check = report.check;

const PORT = 8186, PREFIX_PORT = 8187;
const server = await serveSite(PORT);

/* A static host that mounts the repo at /ELC567-Bot/ and 404s everywhere else. */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const prefixed = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]), P = '/ELC567-Bot/';
  let rel = u.startsWith(P) ? u.slice(P.length) : null;
  if (rel !== null && (rel === '' || rel.endsWith('/'))) rel += 'index.html';
  const f = rel === null ? null : path.join(ROOT, rel);
  if (!f || !f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('404');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => prefixed.listen(PREFIX_PORT, r));

/* Chromium resolves these made-up public-looking names to this machine, so the page
   really is loaded from a non-loopback hostname - not a stubbed location. */
const PUBLIC_HOSTS = ['learn.example.test', 'mcroney531-ctrl.github.io.example.test',
                      'localhost.example.test', '127.0.0.1.example.test', 'notlocalhost.example.test'];
const browser = await chromium.launch({
  args: ['--host-resolver-rules=' + PUBLIC_HOSTS.map(h => 'MAP ' + h + ' 127.0.0.1').join(', ')]
});

async function page_(url, prep = null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (prep) await prep(ctx);
  const page = await ctx.newPage();
  const warnings = [];
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'warn') warnings.push(m.text()); });
  report.watch(page);
  await page.goto(url);
  await page.waitForTimeout(500);
  return { ctx, page, warnings };
}

try {
  // ============================ Start is quiet ============================
  {
    const { ctx, page, warnings } = await page_(`http://127.0.0.1:${PORT}/`);
    const motion = await page.evaluate(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
    check('motion is on for this check (a reduced-motion run skips the animation entirely)', motion);
    await page.click('#bw-start');
    await page.waitForTimeout(1500);
    check('Start reaches the Journey', await page.locator('#bw-map').isVisible());
    check('and the Start animation warns about no missing target', warnings.every(w => !/GSAP|target/i.test(w)),
      JSON.stringify(warnings));
    check('and the console has no warnings at all', warnings.length === 0, JSON.stringify(warnings));
    check('the Journey is left clean: no leftover inline animation state on the stations',
      await page.evaluate(() => [...document.querySelectorAll('.bw-station-card')]
        .every(c => !c.style.opacity && !c.style.transform)));
    await ctx.close();
  }

  // ============================ admin: local only ============================
  /* Not every machine has an IPv6 loopback to serve on (this sandbox has none), and a
     page's hostname for it is the bracketed "[::1]" - exactly the spelling a naive
     === "::1" misses. So that one is served by intercepting the request: the page is
     genuinely loaded from http://[::1]:PORT/, and location.hostname is what a real
     one would be. */
  const ipv6 = async ctx => ctx.route(`http://[::1]:${PORT}/**`, async route => {
    const u = new URL(route.request().url());
    const r = await fetch(`http://127.0.0.1:${PORT}${u.pathname}${u.search}`);
    await route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'text/plain' },
                          body: Buffer.from(await r.arrayBuffer()) });
  });
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const r = await page_(`http://${host}:${PORT}/?admin=1`, host === '[::1]' ? ipv6 : null);
    check(host + ': the page really is on that hostname', await r.page.evaluate(() => location.hostname) === host);
    check(host + ': ?admin=1 builds the toolbar', await r.page.locator('#bw-admin').isVisible());
    check(host + ': and marks itself ADMIN', await r.page.locator('.bw-admin-tag').count() === 1);
    await r.ctx.close();
  }

  for (const host of PUBLIC_HOSTS) {
    const { ctx, page } = await page_(`http://${host}:${PORT}/?admin=1`);
    const probe = await page.evaluate(() => ({
      host: location.hostname,
      bar: document.querySelectorAll('#bw-admin, .bw-admin, .bw-admin-tag, [class*="bw-admin"]').length,
      marked: document.querySelectorAll('[data-admin]').length,
      saved: localStorage.getItem('brainstorm_workflow_data') }));
    check(host + ': ?admin=1 builds no toolbar', probe.bar === 0, JSON.stringify(probe));
    check(host + ': nothing marks the page as admin', probe.marked === 0, JSON.stringify(probe));
    check(host + ': nothing was filled in or unlocked', !probe.saved || !JSON.parse(probe.saved).problem,
      JSON.stringify(probe));
    check(host + ': the page is the ordinary landing', await page.locator('#bw-landing').isVisible());
    /* ...and the learner can still use the activity there. */
    await page.click('#bw-start');
    await page.waitForTimeout(900);
    check(host + ': Start still works, with only Stage 1 open',
      await page.locator('#bw-map').isVisible() &&
      await page.locator('.bw-station[data-state="locked"]').count() === 4);
    await ctx.close();
  }

  // ============================ the public door is gone ============================
  check('there is no /admin/ redirect in the published site', !fs.existsSync(path.join(ROOT, 'admin')));
  {
    const { ctx, page } = await page_(`http://127.0.0.1:${PORT}/`);
    const res = await page.goto(`http://127.0.0.1:${PORT}/admin/`);
    check('and /admin/ is a 404, not a hop to ?admin=1', res.status() === 404, String(res.status()));
    await ctx.close();
  }

  // ============================ .nojekyll ============================
  check('.nojekyll is at the repository root, so Pages serves the files as they are',
    fs.existsSync(path.join(ROOT, '.nojekyll')));

  // ============================ the project-site subpath ============================
  {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map(m => m[1])
      .filter(u => !/^(https?:|mailto:|data:|\/\/)/.test(u));
    check('index.html names its assets, and none is root-absolute (which breaks under /ELC567-Bot/)',
      refs.length >= 8 && refs.every(u => !u.startsWith('/')), JSON.stringify(refs));
    const { ctx, page } = await page_(`http://127.0.0.1:${PREFIX_PORT}/ELC567-Bot/`);
    const failed = [], external = [];
    page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
    page.on('request', r => { if (!r.url().startsWith(`http://127.0.0.1:${PREFIX_PORT}/`)) external.push(r.url()); });
    await page.reload();
    await page.waitForTimeout(600);
    check('served from /ELC567-Bot/, the activity renders', await page.locator('#bw-start').isVisible());
    const sheets = await page.evaluate(() => [...document.styleSheets].map(s => { try { return s.cssRules.length; } catch (e) { return -1; } }));
    check('every stylesheet loaded with rules', sheets.length >= 7 && sheets.every(n => n > 0), JSON.stringify(sheets));
    check('and the script ran: Start is wired', await page.evaluate(() => !!window.gsap) );
    await page.click('#bw-start');
    await page.waitForTimeout(900);
    check('Start works under the subpath', await page.locator('#bw-map').isVisible());
    check('no request failed, and none left the site', failed.length === 0 && external.length === 0,
      JSON.stringify({ failed, external }));
    await ctx.close();
  }
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
prefixed.close();
process.exit(passed ? 0 : 1);
