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
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
