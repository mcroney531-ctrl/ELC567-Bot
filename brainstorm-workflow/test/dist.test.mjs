/*
 * Smoke test of the built paste-ready files in dist/ - the artifacts that
 * actually go into Rise. Runs the real five-block lesson end to end using
 * those files verbatim, so a broken build can't ship silently.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeReporter, loadChromium } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

execFileSync(process.execPath, [path.join(ROOT, 'build.mjs')], { stdio: 'pipe' });

const chromium = await loadChromium();
const report = makeReporter('dist build');
const check = report.check;

const FILES = [
  ['capture', '1-capture.html'],
  ['c1', '2-coach-handoff.html'],
  ['c2', '3-coach-standards.html'],
  ['c3', '4-coach-guardrails.html'],
  ['artifact', '5-artifact.html']
];

const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const lesson = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
${FILES.map(([id, f]) =>
  `<p>Rise content.</p><iframe id="${id}" style="width:900px;height:820px;border:0" srcdoc="${
    esc(fs.readFileSync(path.join(ROOT, 'dist', f), 'utf8'))}"></iframe>`).join('\n')}
</body></html>`;

const server = await new Promise(r => {
  const s = http.createServer((rq, rs) => {
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(lesson);
  });
  s.listen(8141, () => r(s));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
report.watch(page);
const F = id => page.frameLocator('#' + id);
const waitBots = (id, n) => page.waitForFunction(
  ([fid, k]) => document.querySelector('#' + fid).contentDocument
    .querySelectorAll('.bw-msg-bot:not([data-typing])').length >= k, [id, n], { timeout: 12000 });

try {
  // every generated file is complete and self-contained
  for (const [, f] of FILES) {
    const body = fs.readFileSync(path.join(ROOT, 'dist', f), 'utf8');
    check(f + ' is self-contained', !/src=["']https?:/.test(body) && body.includes('</script>'));
    check(f + ' carries its block banner', body.startsWith('<!--'));
  }

  await page.goto('http://127.0.0.1:8141/');
  await page.waitForTimeout(1000);

  check('capture block shows the form', await F('capture').locator('#bw-problem').isVisible());
  check('chat blocks show a chat', await F('c1').locator('.bw-step[data-step="4"]').isVisible());
  check('artifact block shows the prompt box', await F('artifact').locator('.bw-step[data-step="5"]').isVisible());

  await F('capture').locator('#bw-problem').fill(
    'Every Monday I spend two hours building status updates for eleven clients, rewriting the same lines.');
  await F('capture').locator('[data-next="1"]').click();
  const cards = F('capture').locator('#bw-cards .bw-card');
  await cards.nth(0).locator('input').nth(0).fill('Pull last week delivery numbers');
  await cards.nth(0).locator('input').nth(1).fill('Asana, Harvest');
  await cards.nth(1).locator('input').nth(0).fill('Draft the update per client');
  await cards.nth(1).locator('input').nth(1).fill('Google Docs');
  await F('capture').locator('[data-next="2"]').click();
  await page.waitForTimeout(900);

  await waitBots('c1', 1);
  check('chat 1 opened from the built file',
    (await F('c1').locator('.bw-msg-bot').first().textContent()).includes('Every Monday'));

  const say = async (id, text, n) => {
    await F(id).locator('#bw-chat-input').fill(text);
    await F(id).locator('#bw-chat-send').click();
    await waitBots(id, n);
  };
  await say('c1', 'The drafting. Same four paragraphs with different names in them.', 2);
  await waitBots('c2', 1);
  await say('c2', 'Four short paragraphs, no bullets, under 200 words, direct tone.', 2);
  await say('c2', 'The last paragraph, the what-I-would-watch-next-week call. That judgment is mine.', 3);
  await waitBots('c3', 1);
  await say('c3', 'Never invent a number. Mark a gap as MISSING and keep going.', 2);
  await page.waitForTimeout(1000);

  const v2 = await F('artifact').locator('#bw-prompt-v2').inputValue();
  check('built lesson produces a complete prompt',
    v2.includes('drafting') && v2.includes('under 200 words') &&
    v2.includes('judgment is mine') && v2.includes('Never invent a number'), v2.slice(0, 220));
  check('no unfilled placeholders left',
    !/\[Name the steps|\[Format, length|\[Facts, constraints/.test(v2));
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
