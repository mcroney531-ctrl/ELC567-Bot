/*
 * The multi-block Rise layout: one scrolling page, three custom code blocks,
 * each pasted with a different CONFIG.blockRole, all sharing localStorage.
 * Checks that state flows downward live, that no block clobbers another's
 * work, and that each block only renders its own slice.
 */
import http from 'node:http';
import { withConfig, makeReporter, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('multi-block');
const check = report.check;

const roleDoc = role => withConfig({ blockRole: `"${role}"` })
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const host = `<!doctype html><html><head><meta charset="utf-8"><title>Lesson</title></head><body>
<h1>Rise lesson</h1>
<iframe id="capture"  style="width:900px;height:900px" srcdoc="${roleDoc('capture')}"></iframe>
<p>Rise text block between the custom blocks.</p>
<iframe id="coach"    style="width:900px;height:900px" srcdoc="${roleDoc('coach')}"></iframe>
<p>More Rise text.</p>
<iframe id="artifact" style="width:900px;height:900px" srcdoc="${roleDoc('artifact')}"></iframe>
</body></html>`;

const server = await new Promise(r => {
  const s = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(host);
  });
  s.listen(8124, () => r(s));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
report.watch(page);

const F = id => page.frameLocator('#' + id);
const settle = (ms = 700) => page.waitForTimeout(ms);
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data') || 'null'));

try {
  await page.goto('http://127.0.0.1:8124/');
  await settle(800);

  // ---- each block renders only its own slice ----
  const visibleSteps = async (id) => {
    const out = [];
    for (let n = 1; n <= 5; n++) {
      if (await F(id).locator(`.bw-step[data-step="${n}"]`).isVisible()) out.push(n);
    }
    return out.join(',');
  };
  check('capture renders steps 1-3', await visibleSteps('capture') === '1,2,3', await visibleSteps('capture'));
  check('coach renders only step 4', await visibleSteps('coach') === '4', await visibleSteps('coach'));
  check('artifact renders only step 5', await visibleSteps('artifact') === '5', await visibleSteps('artifact'));
  check('capture keeps the intro', await F('capture').locator('.bw-hero').isVisible());
  check('coach drops the intro', !(await F('coach').locator('.bw-hero').isVisible()));
  check('coach labelled Part 2 of 3', (await F('coach').locator('#bw-progress-label').textContent()).includes('Part 2 of 3'));

  // ---- downstream blocks gate until the capture block is filled in ----
  check('coach shows a prerequisite notice', await F('coach').locator('#bw-prereq-4').isVisible());
  check('coach hides the chat entirely', !(await F('coach').locator('#bw-chat-wrap').isVisible()));
  check('coach has not started a conversation', await F('coach').locator('.bw-msg').count() === 0);
  check('gated coach hides copy that would be untrue',
    !(await F('coach').locator('#bw-panel-4 .bw-step-intro').isVisible()));
  check('gated coach chip reads Waiting',
    (await F('coach').locator('.bw-step[data-step="4"] [data-chip]').textContent()).trim() === 'WAITING'
    || (await F('coach').locator('.bw-step[data-step="4"] [data-chip]').textContent()).trim() === 'Waiting');
  check('gated coach cannot advance',
    await F('coach').locator('[data-next="4"]').isDisabled());
  check('artifact gates too', await F('artifact').locator('#bw-prereq-5').isVisible());
  check('artifact hides the prompt box', !(await F('artifact').locator('#bw-final-wrap').isVisible()));

  // ---- fill the capture block ----
  await F('capture').locator('#bw-problem').fill(
    'Every Monday I spend two hours building status updates for eleven clients, rewriting the same sentences.');
  await F('capture').locator('[data-next="1"]').click();
  const cards = F('capture').locator('#bw-cards .bw-card');
  await cards.nth(0).locator('input').nth(0).fill('Pull last week delivery numbers');
  await cards.nth(0).locator('input').nth(1).fill('Asana, Harvest');
  await cards.nth(1).locator('input').nth(0).fill('Draft the update per client');
  await cards.nth(1).locator('input').nth(1).fill('Google Docs');
  await F('capture').locator('[data-next="2"]').click();
  await settle();

  // ---- the coach block unlocks LIVE, with no reload ----
  check('coach unlocked without a reload', !(await F('coach').locator('#bw-prereq-4').isVisible()));
  check('coach revealed the chat', await F('coach').locator('#bw-chat-wrap').isVisible());
  check('unlocked coach restores its intro copy',
    await F('coach').locator('#bw-panel-4 .bw-step-intro').isVisible());
  check('unlocked coach can advance', !(await F('coach').locator('[data-next="4"]').isDisabled()));
  await page.waitForFunction(
    () => document.querySelector('#coach').contentDocument
      .querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1, null, { timeout: 8000 });
  const opening = await F('coach').locator('.bw-msg-bot').first().textContent();
  check('coach opened with the capture block\'s problem', opening.includes('Every Monday'), opening.slice(0, 100));
  check('coach knows the tools too', opening.includes('Asana, Harvest'), opening.slice(0, 200));
  check('artifact unlocked as well', !(await F('artifact').locator('#bw-prereq-5').isVisible()));
  const v2early = await F('artifact').locator('#bw-prompt-v2').inputValue();
  check('artifact already shows the template', v2early.includes('Every Monday'), v2early.slice(0, 80));

  // ---- capture hands off rather than opening a step it does not own ----
  await F('capture').locator('[data-next="3"]').click();
  await settle(400);
  check('capture shows a handoff note', await F('capture').locator('#bw-handoff').isVisible());
  check('handoff points at the next section',
    (await F('capture').locator('#bw-handoff').textContent()).includes('next section'));

  // ---- run the conversation in the coach block ----
  const answers = [
    'The drafting step. Same four paragraphs with different names in them.',
    'Four short paragraphs, no bullets, under 200 words, direct tone.',
    'The last paragraph, the what-I-would-watch-next-week call. That judgment is mine.',
    'Never invent a number. Mark a gap as MISSING and keep going.'
  ];
  for (let i = 0; i < answers.length; i++) {
    await F('coach').locator('#bw-chat-input').fill(answers[i]);
    await F('coach').locator('#bw-chat-send').click();
    await page.waitForFunction(
      k => document.querySelector('#coach').contentDocument
        .querySelectorAll('.bw-msg-bot:not([data-typing])').length >= k, i + 2, { timeout: 10000 });
  }
  await settle();

  // ---- the artifact block picks up the finished prompt live ----
  const v2 = await F('artifact').locator('#bw-prompt-v2').inputValue();
  check('artifact lifted the coach prompt live', v2.includes('under 200 words'), v2.slice(0, 120));
  check('artifact carries the keep answer', v2.includes('judgment is mine'));
  check('artifact credits the coach',
    (await F('artifact').locator('#bw-v2-source').textContent()).includes('conversation with the coach'));

  // ---- no clobber: editing upstream must not erase downstream work ----
  await F('capture').locator('#bw-head-1').click();
  await F('capture').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand, and it costs me two hours.');
  await settle();
  const after = await stored();
  check('conversation survived an upstream edit', after.botConversation.length === 9,
    'messages=' + after.botConversation.length);
  check('coach answers survived', after.botAnswers.keep.includes('judgment is mine'));
  check('final prompt survived', after.masterPromptV2.includes('under 200 words'));
  check('the upstream edit itself landed', after.problem.includes('costs me two hours'));

  // ---- and downstream writes must not erase upstream work ----
  await F('coach').locator('#bw-chat-input').fill('One more thing: keep the client names exact.');
  await F('coach').locator('#bw-chat-send').click();
  await page.waitForFunction(
    () => document.querySelector('#coach').contentDocument
      .querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 6, null, { timeout: 10000 });
  await settle();
  const after2 = await stored();
  check('problem survived a downstream write', after2.problem.includes('costs me two hours'));
  check('workflow steps survived', after2.steps.length === 2 && after2.steps[0].tools === 'Asana, Harvest');

  // ---- a full page reload restores every block ----
  await page.reload();
  await settle(1000);
  check('reload: capture restored', (await F('capture').locator('#bw-problem').inputValue()).includes('costs me two hours'));
  check('reload: coach restored the transcript', await F('coach').locator('.bw-msg').count() === 11,
    'msgs=' + await F('coach').locator('.bw-msg').count());
  check('reload: artifact restored', (await F('artifact').locator('#bw-prompt-v2').inputValue()).includes('under 200 words'));
  check('reload: coach did not re-open a second conversation',
    (await F('coach').locator('.bw-msg-bot').first().textContent()).includes('Every Monday'));

  // ---- start over in one block clears them all ----
  await F('artifact').locator('#bw-reset').click();
  await F('artifact').locator('#bw-reset').click();   // inline confirm
  await settle(900);
  check('reset cleared the capture block', (await F('capture').locator('#bw-problem').inputValue()) === '');
  check('reset cleared the coach transcript', await F('coach').locator('.bw-msg').count() === 0,
    'msgs=' + await F('coach').locator('.bw-msg').count());
  check('reset re-gated the coach', await F('coach').locator('#bw-prereq-4').isVisible());
  check('reset re-gated the artifact', await F('artifact').locator('#bw-prereq-5').isVisible());
  check('reset emptied storage', (await stored()) === null);

  // ---- the split must survive a block that never receives storage events ----
  // On the published Review 360 lesson, the lower block recorded zero storage
  // events while the upper one recorded three. Whatever the cause, a downstream
  // block cannot be allowed to sit on stale state, so prove the poll carries it
  // with the event path removed entirely.
  const deafCtx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await deafCtx.addInitScript(() => {
    const original = window.addEventListener.bind(window);
    window.__storageListeners = 0;
    window.addEventListener = function (type, fn, opts) {
      if (type === 'storage') { window.__storageListeners++; return; }  // swallowed
      return original(type, fn, opts);
    };
  });
  const deaf = await deafCtx.newPage();
  report.watch(deaf);
  await deaf.goto('http://127.0.0.1:8124/');
  await deaf.waitForTimeout(900);
  const D = id => deaf.frameLocator('#' + id);

  const blockFrames = deaf.frames().filter(f => f !== deaf.mainFrame());
  const swallowed = await Promise.all(
    blockFrames.map(f => f.evaluate(() => window.__storageListeners).catch(() => 0)));
  check('every block really had its storage listener swallowed',
    blockFrames.length === 3 && swallowed.every(c => c > 0), JSON.stringify(swallowed));
  check('deaf run starts gated', await D('coach').locator('#bw-prereq-4').isVisible());

  await D('capture').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand and it costs me two full hours.');
  await D('capture').locator('[data-next="1"]').click();
  const dcards = D('capture').locator('#bw-cards .bw-card');
  await dcards.nth(0).locator('input').nth(0).fill('Pull the delivery numbers');
  await dcards.nth(0).locator('input').nth(1).fill('Asana');
  await dcards.nth(1).locator('input').nth(0).fill('Draft each update');
  await dcards.nth(1).locator('input').nth(1).fill('Google Docs');
  await D('capture').locator('[data-next="2"]').click();

  // no event will arrive; only the poll can carry this
  await deaf.waitForFunction(
    () => !document.querySelector('#coach').contentDocument
      .querySelector('#bw-prereq-4').offsetParent === false, null, { timeout: 6000 }
  ).catch(() => {});
  await deaf.waitForTimeout(2500);

  check('coach unlocks with no storage events at all',
    !(await D('coach').locator('#bw-prereq-4').isVisible()));
  check('coach opened its conversation from polled state',
    await D('coach').locator('.bw-msg-bot').count() >= 1);
  const deafOpening = await D('coach').locator('.bw-msg-bot').first().textContent();
  check('polled coach greeted with the real problem',
    deafOpening.includes('costs me two full hours'), deafOpening.slice(0, 110));
  check('artifact also caught up by polling',
    (await D('artifact').locator('#bw-prompt-v2').inputValue()).includes('costs me two full hours'));
  await deafCtx.close();

  // Negative control. Same deaf setup with the poll switched off too: the coach
  // must stay gated. Without this, the test above could be passing for some
  // other reason and we would not know the poll is what carries the sync.
  const stuckDoc = r => withConfig({ blockRole: `"${r}"`, syncPollMs: '99999999' })
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const stuckPage = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<iframe id="capture" style="width:900px;height:800px" srcdoc="${stuckDoc('capture')}"></iframe>
<iframe id="coach" style="width:900px;height:800px" srcdoc="${stuckDoc('coach')}"></iframe>
</body></html>`;
  const stuckServer = await new Promise(r => {
    const sv = http.createServer((rq, rs) => {
      rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rs.end(stuckPage);
    });
    sv.listen(8130, () => r(sv));
  });
  const stuckCtx = await browser.newContext();
  await stuckCtx.addInitScript(() => {
    const original = window.addEventListener.bind(window);
    window.addEventListener = function (type, fn, opts) {
      if (type === 'storage') return;
      return original(type, fn, opts);
    };
  });
  const stuck = await stuckCtx.newPage();
  await stuck.goto('http://127.0.0.1:8130/');
  await stuck.waitForTimeout(700);
  const S = id => stuck.frameLocator('#' + id);
  await S('capture').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand and it costs me two hours.');
  await S('capture').locator('[data-next="1"]').click();
  const scards = S('capture').locator('#bw-cards .bw-card');
  await scards.nth(0).locator('input').nth(0).fill('Pull numbers');
  await scards.nth(0).locator('input').nth(1).fill('Asana');
  await scards.nth(1).locator('input').nth(0).fill('Draft update');
  await scards.nth(1).locator('input').nth(1).fill('Google Docs');
  await S('capture').locator('[data-next="2"]').click();
  await stuck.waitForTimeout(3200);
  check('negative control: no events AND no poll leaves it gated',
    await S('coach').locator('#bw-prereq-4').isVisible());
  await stuckCtx.close();
  stuckServer.close();


  // ---- a block below the fold catches up when scrolled to ----
  // Both probe runs on the published lesson showed the lower block receiving
  // zero storage events. Below the fold is also where browsers throttle timers.
  // With events swallowed AND the poll switched off, only the scroll-into-view
  // sync can carry this - which is the mechanism a learner actually triggers.
  const foldDoc = r => withConfig({ blockRole: `"${r}"`, syncPollMs: '99999999' })
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const foldPage = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
<iframe id="capture" style="width:900px;height:760px;border:0" srcdoc="${foldDoc('capture')}"></iframe>
<div style="height:2400px">a lot of Rise content in between</div>
<iframe id="coach" style="width:900px;height:760px;border:0" srcdoc="${foldDoc('coach')}"></iframe>
</body></html>`;
  const foldServer = await new Promise(r => {
    const sv = http.createServer((rq, rs) => {
      rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rs.end(foldPage);
    });
    sv.listen(8132, () => r(sv));
  });
  const foldCtx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await foldCtx.addInitScript(() => {
    const original = window.addEventListener.bind(window);
    window.addEventListener = function (type, fn, opts) {
      if (type === 'storage') return;
      return original(type, fn, opts);
    };
  });
  const fold = await foldCtx.newPage();
  report.watch(fold);
  await fold.goto('http://127.0.0.1:8132/');
  await fold.waitForTimeout(800);
  const F2 = id => fold.frameLocator('#' + id);

  await F2('capture').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand and it costs me two hours.');
  await F2('capture').locator('[data-next="1"]').click();
  const fcards = F2('capture').locator('#bw-cards .bw-card');
  await fcards.nth(0).locator('input').nth(0).fill('Pull the delivery numbers');
  await fcards.nth(0).locator('input').nth(1).fill('Asana');
  await fcards.nth(1).locator('input').nth(0).fill('Draft each update');
  await fcards.nth(1).locator('input').nth(1).fill('Google Docs');
  await F2('capture').locator('[data-next="2"]').click();
  await fold.waitForTimeout(1200);

  check('offscreen block has not synced yet', await F2('coach').locator('#bw-prereq-4').isVisible());
  await fold.locator('#coach').scrollIntoViewIfNeeded();
  await fold.waitForTimeout(1800);
  check('scrolling to the block syncs it', !(await F2('coach').locator('#bw-prereq-4').isVisible()));
  check('and it opens with the real problem',
    (await F2('coach').locator('.bw-msg-bot').first().textContent()).includes('costs me two hours'));
  await foldCtx.close();
  foldServer.close();

} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
