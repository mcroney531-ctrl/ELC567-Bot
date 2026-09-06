/*
 * The preview page itself: nine blocks, in order, loading the built files and
 * sharing state. If this passes, what the designer previews is what a learner
 * gets - which is the only reason the preview is worth having.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeReporter, loadChromium } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DIST = path.join(ROOT, 'dist');

execFileSync(process.execPath, [path.join(ROOT, 'build.mjs')], { stdio: 'pipe' });
execFileSync(process.execPath, [path.join(ROOT, 'preview.mjs')], { stdio: 'pipe' });

const chromium = await loadChromium();
const report = makeReporter('preview page');
const check = report.check;

const server = await new Promise(r => {
  const s = http.createServer((rq, rs) => {
    const name = decodeURIComponent(rq.url.split('?')[0]).replace(/^\/+/, '') || 'preview.html';
    const file = path.join(DIST, path.basename(name));
    if (!fs.existsSync(file)) { rs.writeHead(404); rs.end('no'); return; }
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(fs.readFileSync(file));
  });
  s.listen(8148, () => r(s));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
report.watch(page);

const nth = i => page.frameLocator(`.pv-frame >> nth=${i}`);
const settle = (ms = 900) => page.waitForTimeout(ms);
const bots = (i, n) => page.waitForFunction(
  ([k, want]) => document.querySelectorAll('.pv-frame')[k].contentDocument
    .querySelectorAll('.bw-msg-bot:not([data-typing])').length >= want, [i, n], { timeout: 12000 });
const say = async (i, text, n) => {
  await nth(i).locator('#bw-chat-input').fill(text);
  await nth(i).locator('#bw-chat-send').click();
  await bots(i, n);
};

try {
  await page.goto('http://127.0.0.1:8148/');
  await settle(1400);

  check('all nine blocks are on the page',
    await page.locator('.pv-frame').count() === 9, String(await page.locator('.pv-frame').count()));
  check('it says the blocks can see each other',
    (await page.locator('#pv-status').textContent()).includes('sharing state'),
    await page.locator('#pv-status').textContent());
  check('the jump nav covers every block', await page.locator('.pv-jump a').count() === 9);
  check('each block is labelled with the role you paste',
    (await page.locator('.pv-head code').nth(2).textContent()).includes('coach-workflow'));

  // Frames size themselves from the height each block reports.
  const heights = await page.locator('.pv-frame').evaluateAll(
    els => els.map(e => e.getBoundingClientRect().height));
  check('blocks size themselves rather than sitting at a fixed height',
    new Set(heights.map(Math.round)).size > 1, heights.map(Math.round).join(','));
  check('no block collapsed to nothing', heights.every(h => h > 200), heights.map(Math.round).join(','));

  // ---- the real lesson, driven through the preview ----
  await nth(1).locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.');
  await nth(1).locator('[data-next="1"]').click();
  await settle(1500);

  await bots(2, 1);
  check('block 3 unlocked once the task was named',
    await nth(2).locator('#bw-chat-wrap').isVisible());
  await say(2, 'I pull the numbers, then draft each client update, then reformat the deck', 2);
  await say(2, 'yes', 3);
  await settle(1400);

  await bots(3, 1);
  await say(3, '1 Tableau, 2 Word, 3 PowerPoint', 2);
  await say(3, 'looks good', 3);
  await settle(1500);

  check('block 5 built a draft from blocks 3 and 4',
    (await nth(4).locator('#bw-prompt-v1').textContent()).includes('Tableau'));

  await bots(5, 1);
  await say(5, 'The drafting. Same four paragraphs with different names in them.', 2);
  await bots(6, 1);
  await say(6, 'Four short paragraphs, no bullets, under 200 words, direct tone.', 2);
  await say(6, 'The last paragraph, the what-to-watch-next-week call. That judgment is mine.', 3);
  await bots(7, 1);
  await say(7, 'Never invent a number. Mark a gap as MISSING and keep going.', 2);
  await settle(1200);

  const v2 = await nth(8).locator('#bw-prompt-v2').inputValue();
  check('block 9 has the finished prompt',
    v2.includes('under 200 words') && v2.includes('Never invent a number') && v2.includes('Tableau'),
    v2.slice(0, 220));

  // ---- start over actually starts over ----
  await page.locator('#pv-reset').click();
  await settle(2000);
  check('Start over clears every block',
    (await nth(1).locator('#bw-problem').inputValue()) === '' &&
    !(await nth(2).locator('#bw-chat-wrap').isVisible()),
    await nth(1).locator('#bw-problem').inputValue());
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
