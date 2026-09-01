/*
 * The split Rise lesson: one scrolling page, five custom code blocks - a
 * capture form, three separate coach conversations, and the final prompt.
 * The point of this suite is that the three chats are genuinely separate
 * conversations that still build one shared master prompt, and that none of
 * them can trample another's work.
 */
import http from 'node:http';
import { withConfig, makeReporter, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('multi-block');
const check = report.check;

const BLOCKS = [
  ['capture', 'capture'],
  ['c1', 'coach-handoff'],
  ['c2', 'coach-standards'],
  ['c3', 'coach-guardrails'],
  ['artifact', 'artifact']
];

const doc = (role, extra = {}) => withConfig({ blockRole: `"${role}"`, ...extra })
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const lesson = (extra = {}) => `<!doctype html><html><head><meta charset="utf-8"><title>Lesson</title></head>
<body style="margin:0">${BLOCKS.map(([id, role]) =>
  `<p>Rise teaching content.</p><iframe id="${id}" style="width:900px;height:820px;border:0" srcdoc="${doc(role, extra)}"></iframe>`
).join('\n')}</body></html>`;

const serve = (html, port) => new Promise(r => {
  const s = http.createServer((rq, rs) => {
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(html);
  });
  s.listen(port, () => r(s));
});

const server = await serve(lesson(), 8124);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
report.watch(page);

const F = id => page.frameLocator('#' + id);
const settle = (ms = 700) => page.waitForTimeout(ms);
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data') || 'null'));
const waitBots = (id, n) => page.waitForFunction(
  ([fid, k]) => document.querySelector('#' + fid).contentDocument
    .querySelectorAll('.bw-msg-bot:not([data-typing])').length >= k, [id, n], { timeout: 12000 });

async function say(id, text, expectBots) {
  await F(id).locator('#bw-chat-input').fill(text);
  await F(id).locator('#bw-chat-send').click();
  await waitBots(id, expectBots);
}

try {
  await page.goto('http://127.0.0.1:8124/');
  await settle(1000);

  // ---- each block renders only its own slice, with its own topic ----
  const visible = async id => {
    const out = [];
    for (let n = 1; n <= 5; n++) {
      if (await F(id).locator(`.bw-step[data-step="${n}"]`).isVisible()) out.push(n);
    }
    return out.join(',');
  };
  check('capture renders steps 1-3', await visible('capture') === '1,2,3');
  check('each chat renders only step 4',
    await visible('c1') === '4' && await visible('c2') === '4' && await visible('c3') === '4');
  check('artifact renders only step 5', await visible('artifact') === '5');

  const heading = id => F(id).locator('#bw-head-4 .bw-h2').textContent();
  check('chat 1 has its own heading', (await heading('c1')).includes('take over'), await heading('c1'));
  check('chat 2 has its own heading', (await heading('c2')).includes('good result'), await heading('c2'));
  check('chat 3 has its own heading', (await heading('c3')).includes('never get wrong'), await heading('c3'));
  check('the three headings differ',
    new Set([await heading('c1'), await heading('c2'), await heading('c3')]).size === 3);
  const nextLabel = id => F(id).locator('[data-next="4"]').textContent();
  check('middle chats point at the next section, not the final prompt',
    !(await nextLabel('c1')).includes('final prompt') && !(await nextLabel('c2')).includes('final prompt'),
    (await nextLabel('c1')) + ' | ' + (await nextLabel('c2')));
  check('the last chat points at the final prompt', (await nextLabel('c3')).includes('final prompt'));

  // ---- all three chats gate until the capture block is filled ----
  check('every chat starts gated',
    (await F('c1').locator('#bw-prereq-4').isVisible()) &&
    (await F('c2').locator('#bw-prereq-4').isVisible()) &&
    (await F('c3').locator('#bw-prereq-4').isVisible()));
  check('no chat has started a conversation',
    (await F('c1').locator('.bw-msg').count()) === 0 &&
    (await F('c3').locator('.bw-msg').count()) === 0);

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
  await settle(900);

  check('all three chats unlocked live',
    !(await F('c1').locator('#bw-prereq-4').isVisible()) &&
    !(await F('c2').locator('#bw-prereq-4').isVisible()) &&
    !(await F('c3').locator('#bw-prereq-4').isVisible()));

  // ---- chat 1: what to hand over ----
  await waitBots('c1', 1);
  const open1 = await F('c1').locator('.bw-msg-bot').first().textContent();
  check('chat 1 opens with their problem', open1.includes('Every Monday'), open1.slice(0, 90));
  check('chat 1 lists their steps', open1.includes('Asana, Harvest'));
  await say('c1', 'The drafting. Same four paragraphs every week with different names in them.', 2);
  check('chat 1 closed in one exchange', await F('c1').locator('.bw-msg').count() === 3,
    'msgs=' + await F('c1').locator('.bw-msg').count());
  check('chat 1 points at the next section',
    (await F('c1').locator('.bw-msg-bot').last().textContent()).includes('below'));

  // ---- chat 2 is a SEPARATE conversation that knows what chat 1 captured ----
  await waitBots('c2', 1);
  await page.waitForFunction(() => document.querySelector('#c2').contentDocument
    .querySelector('.bw-msg-bot').textContent.includes('drafting'), null, { timeout: 8000 }).catch(() => {});
  const open2 = await F('c2').locator('.bw-msg-bot').first().textContent();
  check('chat 2 quotes what chat 1 captured', open2.includes('drafting'), open2.slice(0, 140));
  check('chat 2 does not replay chat 1', !open2.includes('Every Monday'), open2.slice(0, 140));
  // Chat 2 quoting a snippet of chat 1's answer is the point; what must NOT
  // happen is chat 1's turns appearing in chat 2's transcript.
  const c2Text = await F('c2').locator('#bw-chat-log').textContent();
  check('chat 2 does not replay chat 1 coach turns', !c2Text.includes('This piece is done'), c2Text.slice(0, 120));
  check('chat 2 has its own reply history', await F('c2').locator('.bw-msg-user').count() === 0);
  check('chat 1 kept its own reply', await F('c1').locator('.bw-msg-user').count() === 1);

  await say('c2', 'Four short paragraphs, no bullets, under 200 words, direct client-facing tone.', 2);
  await say('c2', 'The last paragraph, the what-I-would-watch-next-week call. That judgment is mine.', 3);
  check('chat 2 took two exchanges', await F('c2').locator('.bw-msg-user').count() === 2);

  // ---- chat 3 closes it out and emits the prompt ----
  await waitBots('c3', 1);
  await page.waitForFunction(() => document.querySelector('#c3').contentDocument
    .querySelector('.bw-msg-bot').textContent.includes('judgment is mine'), null, { timeout: 8000 }).catch(() => {});
  const open3 = await F('c3').locator('.bw-msg-bot').first().textContent();
  check('chat 3 references what chat 2 captured', open3.includes('judgment is mine'), open3.slice(0, 160));
  check('chat 3 names their tools', open3.includes('Asana'), open3.slice(0, 220));
  await say('c3', 'Never invent a number. If a figure is missing, write MISSING and keep going.', 2);
  check('chat 3 hands back a fenced prompt',
    await F('c3').locator('.bw-msg-bot').last().locator('pre').count() === 1);

  // ---- the artifact block holds every stage's answer ----
  await settle(900);
  const v2 = await F('artifact').locator('#bw-prompt-v2').inputValue();
  check('final prompt carries chat 1', v2.includes('drafting'), v2.slice(0, 200));
  check('final prompt carries chat 2 output', v2.includes('under 200 words'));
  check('final prompt carries chat 2 keep', v2.includes('judgment is mine'));
  check('final prompt carries chat 3', v2.includes('Never invent a number'));
  check('final prompt has no unfilled placeholders',
    !/\[Name the steps|\[Format, length|\[Facts, constraints/.test(v2), v2.slice(0, 300));

  // ---- separate transcripts, one shared artifact, in storage ----
  const saved = await stored();
  check('each stage stored its own transcript',
    saved.conversations.handoff.length === 3 &&
    saved.conversations.standards.length === 5 &&
    saved.conversations.guardrails.length === 3,
    JSON.stringify(Object.keys(saved.conversations).map(k => [k, saved.conversations[k].length])));
  check('answers pooled from all three chats',
    saved.botAnswers.handoff && saved.botAnswers.output && saved.botAnswers.keep && saved.botAnswers.context);

  // ---- no clobber, in any direction ----
  await F('capture').locator('#bw-head-1').click();
  await F('capture').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand, and it costs me two hours.');
  await settle();
  let after = await stored();
  check('upstream edit kept all three transcripts',
    after.conversations.handoff.length === 3 && after.conversations.standards.length === 5 &&
    after.conversations.guardrails.length === 3);
  check('upstream edit kept the pooled answers', after.botAnswers.keep.includes('judgment is mine'));
  check('the upstream edit landed', after.problem.includes('costs me two hours'));

  await say('c1', 'Actually it is the reformatting that hurts most.', 3);
  await settle();
  after = await stored();
  check('a chat write kept the capture work', after.problem.includes('costs me two hours'));
  check('a chat write kept a sibling chat', after.conversations.standards.length === 5);
  check('chat 1 revision did not touch chat 2 answers', after.botAnswers.output.includes('under 200 words'));

  // ---- reload restores every block ----
  await page.reload();
  await settle(1200);
  check('reload: capture restored', (await F('capture').locator('#bw-problem').inputValue()).includes('costs me two hours'));
  check('reload: chat 1 restored', await F('c1').locator('.bw-msg').count() === 5);
  check('reload: chat 2 restored', await F('c2').locator('.bw-msg').count() === 5);
  check('reload: chat 3 restored', await F('c3').locator('.bw-msg').count() === 3);
  check('reload: final prompt restored',
    (await F('artifact').locator('#bw-prompt-v2').inputValue()).includes('under 200 words'));

  // ---- restarting one chat leaves the others alone ----
  await F('c2').locator('#bw-chat-restart').click();
  await F('c2').locator('#bw-chat-restart').click();   // inline confirm
  await settle(1200);
  check('restart cleared only that chat', await F('c2').locator('.bw-msg').count() <= 1,
    'msgs=' + await F('c2').locator('.bw-msg').count());
  check('restart left chat 1 alone', await F('c1').locator('.bw-msg').count() === 5);
  check('restart left chat 3 alone', await F('c3').locator('.bw-msg').count() === 3);
  const afterRestart = await stored();
  check('restart cleared only its own answers',
    !afterRestart.botAnswers.output && afterRestart.botAnswers.context.includes('Never invent'));

  // ---- start over clears the whole lesson ----
  await F('artifact').locator('#bw-reset').click();
  await F('artifact').locator('#bw-reset').click();
  await settle(1200);
  check('reset cleared the capture block', (await F('capture').locator('#bw-problem').inputValue()) === '');
  check('reset cleared every chat',
    (await F('c1').locator('.bw-msg').count()) === 0 && (await F('c3').locator('.bw-msg').count()) === 0);
  check('reset re-gated the chats', await F('c1').locator('#bw-prereq-4').isVisible());
  check('reset emptied storage', (await stored()) === null);
  await ctx.close();

  // ---- it must all still work with storage events swallowed ----
  const deafCtx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await deafCtx.addInitScript(() => {
    const original = window.addEventListener.bind(window);
    window.__storageListeners = 0;
    window.addEventListener = function (type, fn, opts) {
      if (type === 'storage') { window.__storageListeners++; return; }
      return original(type, fn, opts);
    };
  });
  const deaf = await deafCtx.newPage();
  report.watch(deaf);
  await deaf.goto('http://127.0.0.1:8124/');
  await deaf.waitForTimeout(1000);
  const D = id => deaf.frameLocator('#' + id);
  const blockFrames = deaf.frames().filter(f => f !== deaf.mainFrame());
  const swallowed = await Promise.all(
    blockFrames.map(f => f.evaluate(() => window.__storageListeners).catch(() => 0)));
  check('every block had its storage listener swallowed',
    blockFrames.length === 5 && swallowed.every(c => c > 0), JSON.stringify(swallowed));

  await D('capture').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand and it costs me two full hours.');
  await D('capture').locator('[data-next="1"]').click();
  const dcards = D('capture').locator('#bw-cards .bw-card');
  await dcards.nth(0).locator('input').nth(0).fill('Pull the delivery numbers');
  await dcards.nth(0).locator('input').nth(1).fill('Asana');
  await dcards.nth(1).locator('input').nth(0).fill('Draft each update');
  await dcards.nth(1).locator('input').nth(1).fill('Google Docs');
  await D('capture').locator('[data-next="2"]').click();
  await deaf.waitForTimeout(2600);
  check('chats unlock with no storage events at all',
    !(await D('c1').locator('#bw-prereq-4').isVisible()));
  check('polled chat greeted with the real problem',
    (await D('c1').locator('.bw-msg-bot').first().textContent()).includes('costs me two full hours'));
  await deafCtx.close();

  // ---- a block below the fold catches up when scrolled to ----
  // Poll off AND events swallowed, so only the scroll-into-view sync can carry it.
  const foldPage = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
<iframe id="capture" style="width:900px;height:760px;border:0" srcdoc="${doc('capture', { syncPollMs: '99999999' })}"></iframe>
<div style="height:2400px">a lot of Rise content in between</div>
<iframe id="c1" style="width:900px;height:760px;border:0" srcdoc="${doc('coach-handoff', { syncPollMs: '99999999' })}"></iframe>
</body></html>`;
  const foldServer = await serve(foldPage, 8132);
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
  const G = id => fold.frameLocator('#' + id);
  await G('capture').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand and it costs me two hours.');
  await G('capture').locator('[data-next="1"]').click();
  const fcards = G('capture').locator('#bw-cards .bw-card');
  await fcards.nth(0).locator('input').nth(0).fill('Pull the delivery numbers');
  await fcards.nth(0).locator('input').nth(1).fill('Asana');
  await fcards.nth(1).locator('input').nth(0).fill('Draft each update');
  await fcards.nth(1).locator('input').nth(1).fill('Google Docs');
  await G('capture').locator('[data-next="2"]').click();
  await fold.waitForTimeout(1200);
  check('offscreen block has not synced yet', await G('c1').locator('#bw-prereq-4').isVisible());
  await fold.locator('#c1').scrollIntoViewIfNeeded();
  await fold.waitForTimeout(1800);
  check('scrolling to the block syncs it', !(await G('c1').locator('#bw-prereq-4').isVisible()));
  await foldCtx.close();
  foldServer.close();

  // ---- negative control: with every mechanism off it must genuinely break ----
  const stuckServer = await serve(lesson({ syncPollMs: '99999999' }), 8130);
  const stuckCtx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await stuckCtx.addInitScript(() => {
    const original = window.addEventListener.bind(window);
    window.addEventListener = function (type, fn, opts) {
      if (type === 'storage') return;
      return original(type, fn, opts);
    };
    const RealIO = window.IntersectionObserver;
    if (RealIO) window.IntersectionObserver = function () { return { observe() {}, disconnect() {} }; };
  });
  const stuck = await stuckCtx.newPage();
  await stuck.goto('http://127.0.0.1:8130/');
  await stuck.waitForTimeout(900);
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
  check('negative control: no events, no poll, no observer leaves it gated',
    await S('c1').locator('#bw-prereq-4').isVisible());
  await stuckCtx.close();
  stuckServer.close();
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
