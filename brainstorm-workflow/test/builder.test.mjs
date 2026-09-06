/*
 * The lesson builder: your Rise copy and the real blocks on one page.
 *
 * Two of these are regressions against the earlier standalone builder this
 * replaces - copy containing "<" corrupted its own storage, and dragging never
 * reordered anything because the handler sat on a child of the draggable node.
 * Both are cheap to reintroduce, so both are pinned here.
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

for (const script of ['build.mjs', 'preview.mjs', 'builder.mjs']) {
  execFileSync(process.execPath, [path.join(ROOT, script)], { stdio: 'pipe' });
}

const chromium = await loadChromium();
const report = makeReporter('lesson builder');
const check = report.check;

const server = await new Promise(r => {
  const s = http.createServer((rq, rs) => {
    const name = decodeURIComponent(rq.url.split('?')[0]).replace(/^\/+/, '') || 'builder.html';
    const file = path.join(DIST, path.basename(name));
    if (!fs.existsSync(file)) { rs.writeHead(404); rs.end('no'); return; }
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(fs.readFileSync(file));
  });
  s.listen(8150, () => r(s));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
report.watch(page);

const settle = (ms = 700) => page.waitForTimeout(ms);
const rowCount = () => page.locator('.row').count();
// Visual order, which is CSS order here - never the DOM order.
const order = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('.row'))
    .sort((a, b) => (+a.style.order) - (+b.style.order))
    .map(n => n.querySelector('.blk select').value.replace('.html', '')));
const outline = () => page.evaluate(() => JSON.parse(localStorage.getItem('bw_builder_outline')));

try {
  await page.goto('http://127.0.0.1:8150/builder.html');
  await settle(1500);

  // ---- it opens on the shipped lesson, with the real blocks in it ----
  check('opens with the nine-block lesson', await rowCount() === 9, String(await rowCount()));
  check('and says it is saving', (await page.locator('#status').textContent()).includes('Saving'));
  check('every row embeds its own built file',
    (await order()).join(',') ===
    '1-intro,2-problem,3-coach-workflow,4-coach-tools,5-draft,6-coach-handoff,7-coach-standards,8-coach-guardrails,9-artifact',
    (await order()).join(','));
  check('the blocks really loaded, not just the frames', await page.evaluate(() =>
    document.querySelectorAll('.frame').length === 9 &&
    Array.from(document.querySelectorAll('.frame'))
      .every(f => f.contentDocument && f.contentDocument.querySelector('#bw'))));
  check('frames size themselves to their block', await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('.frame')).map(f => Math.round(f.getBoundingClientRect().height));
    return new Set(h).size > 1 && h.every(v => v > 180);
  }));
  check('each row names the file to paste',
    (await page.locator('.file').first().textContent()).includes('dist/1-intro.html'));
  check('the dropdown offers the alternatives too', await page.evaluate(() =>
    document.querySelector('.blk select').options.length === 12));

  // ---- the regression that ate copy: "<" in draft text ----
  const nasty = 'Use <b>bold</b> & keep it under 200 words </textarea><h1>OOPS</h1> then stop';
  await page.locator('.copy textarea').first().fill(nasty);
  await settle(400);
  await page.reload();
  await settle(1500);
  check('copy containing markup survives a reload intact',
    (await page.locator('.copy textarea').first().inputValue()) === nasty,
    await page.locator('.copy textarea').first().inputValue());
  check('and none of it leaked into the page as markup',
    await page.locator('h1:has-text("OOPS")').count() === 0);
  check('storage kept the whole string', (await outline())[0].body === nasty);

  // ---- headings save too ----
  await page.locator('.copy input').first().fill('Why this one task');
  await settle(400);
  check('the heading saves as you type', (await outline())[0].title === 'Why this one task');

  // ---- reorder: arrows ----
  await page.locator('.row .icon[aria-label="Move down"]').first().click();
  await settle(300);
  check('the down arrow moves one place',
    (await order()).slice(0, 3).join(',') === '2-problem,1-intro,3-coach-workflow',
    (await order()).slice(0, 3).join(','));
  await page.locator('.row .icon[aria-label="Move up"]').first().click();
  await settle(300);
  check('and back up again',
    (await order()).slice(0, 3).join(',') === '1-intro,2-problem,3-coach-workflow',
    (await order()).slice(0, 3).join(','));
  check('the first row cannot move up',
    await page.evaluate(() => document.querySelector('.row .icon[aria-label="Move up"]').disabled));

  // ---- reorder: drag, wired to a node that actually receives the events ----
  check('the drag handle is itself the draggable element', await page.evaluate(() =>
    document.querySelector('.row .handle').draggable === true));
  const dragged = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.row'))
      .sort((a, b) => (+a.style.order) - (+b.style.order));
    const dt = new DataTransfer();
    rows[0].querySelector('.handle').dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    rows[2].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    rows[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    rows[0].querySelector('.handle').dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    return Array.from(document.querySelectorAll('.row'))
      .sort((a, b) => (+a.style.order) - (+b.style.order))
      .map(n => n.querySelector('.blk select').value.replace('.html', ''));
  });
  check('dragging row 1 onto row 3 inserts it there, it does not swap',
    dragged.slice(0, 3).join(',') === '2-problem,3-coach-workflow,1-intro', dragged.slice(0, 3).join(','));
  check('the drag order persisted', (await outline())[2].file === '1-intro.html',
    (await outline()).slice(0, 3).map(r => r.file).join(','));
  check('nothing was lost in the move', await rowCount() === 9);

  // put it back
  await page.evaluate(() => { moveTo(rows[2].id, 0); });
  await settle(300);

  // ---- swapping which block sits under a piece of copy ----
  await page.locator('.blk select').nth(2).selectOption('alt-workflow-form.html');
  await settle(1200);
  check('changing the block swaps the embedded file',
    (await page.locator('.file').nth(2).textContent()).includes('alt-workflow-form.html'),
    await page.locator('.file').nth(2).textContent());
  check('and that block is what actually loads', await page.evaluate(() =>
    document.querySelectorAll('.frame')[2].contentDocument
      .querySelector('#bw-workflow-wrap') !== null));
  await page.locator('.blk select').nth(2).selectOption('3-coach-workflow.html');
  await settle(1200);

  // ---- removing takes two presses ----
  const del = page.locator('.row .icon.danger').last();
  await del.click();
  await settle(200);
  check('one press on remove only arms it', await rowCount() === 9);
  check('and says so', (await del.textContent()).includes('Press again'));
  await del.click();
  await settle(400);
  check('the second press removes it', await rowCount() === 8, String(await rowCount()));

  // ---- exports describe the lesson as arranged ----
  const md = await page.evaluate(() => outlineMarkdown());
  check('the outline export leads with your heading', md.includes('## 1. Why this one task'));
  check('it carries your copy', md.includes('under 200 words'));
  check('and names the file and role to paste',
    md.includes('dist/1-intro.html') && md.includes('blockRole `intro`'), md.slice(0, 260));
  check('it renumbered after the edits', !md.includes('## 9.') && md.includes('## 8.'));

  // ---- the lesson still runs in here ----
  await page.locator('.frame').nth(1).scrollIntoViewIfNeeded();
  const F = i => page.frameLocator(`.frame >> nth=${i}`);
  await F(1).locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.');
  await F(1).locator('[data-next="1"]').click();
  await settle(2000);
  check('filling a block still unlocks the next one',
    await F(2).locator('#bw-chat-wrap').isVisible());

  // ---- the two states are separate ----
  const clear = page.locator('#clear-learner');
  await clear.click(); await settle(200); await clear.click();
  await settle(2200);
  check('clearing learner data really clears it',
    (await F(1).locator('#bw-problem').inputValue()) === '',
    await F(1).locator('#bw-problem').inputValue());
  check('and leaves every word you wrote alone',
    (await page.locator('.copy textarea').first().inputValue()) === nasty &&
    (await page.locator('.copy input').first().inputValue()) === 'Why this one task');
  check('including the arrangement', await rowCount() === 8);

  // ---- resetting the outline is the other button ----
  const reset = page.locator('#reset-outline');
  await reset.click(); await settle(200); await reset.click();
  await settle(1500);
  check('resetting the outline restores the shipped nine', await rowCount() === 9, String(await rowCount()));
  check('and clears the copy with it',
    (await page.locator('.copy textarea').first().inputValue()) === '');
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
