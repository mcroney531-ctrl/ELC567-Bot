/*
 * Changing a decision after Refine is complete.
 *
 * Found by persona testing (P08, "Gwen"). Her first Refine answers over-delegated: "it should sign
 * off on the variances under the threshold", and "Not much really" for what stays hers. She then
 * reconsidered and said so in the open chat. The coach replied "Folded that in" - but once all four
 * decisions are settled a free-form message is only appended to the context notes. The settled
 * handoff and keep answers, which write the prompt's "WHAT I NEED YOU TO DO" and "WHAT STAYS WITH ME"
 * sections, were never replaced. The final prompt then told the assistant both to sign off on small
 * variances and never to. Two independent reviewers confirmed it.
 *
 * The fix is structural, not interpretive: nothing guesses which decision a sentence meant to revise.
 *   - a message after completion is kept as extra context, and the reply says plainly that the four
 *     decisions were NOT changed and where the real edit is;
 *   - each settled decision has an Edit control; it reopens that decision by name, and the learner's
 *     next answer replaces the old one through the same capture as the first time;
 *   - Refine is incomplete again until that decision is answered, so Deploy goes back behind it.
 *
 * These tests read the GENERATED prompt in Deploy, not only the stored answers: the defect is in what
 * reaches the learner.
 */
import { serveSite, makeReporter, loadChromium, seedState, waitBots } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('refine revision');
const check = report.check;

const PORT = 8191;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const STALE_HANDOFF = 'Compare each account to last month and to budget and flag anything over the threshold. ' +
  'And it should sign off on the variances under the threshold so I don\'t have to look at them.';
const ANSWERS = {
  handoff: STALE_HANDOFF,
  keep: 'The emails to the department heads, and I will decide what gets looked at next month.',
  output: 'Two or three sentences per flagged account: what moved, by how much, and the reason given.',
  context: 'The threshold is 10 percent and 5,000 dollars, both. Payroll and intercompany are always flagged.'
};
const CORRECTION = 'Actually it never decides a variance is fine or signs off on anything. Sign-off on every variance stays mine.';
const REPLACEMENT = 'Compare and flag, then draft the commentary. It never decides a variance is fine and never signs off on anything.';

let ctx, page, turns = 0;
async function openRefine() {
  ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  page = await ctx.newPage();
  report.watch(page);
  await page.addInitScript(s => {
    localStorage.setItem('bw_started', '1');
    if (!localStorage.getItem('brainstorm_workflow_data')) localStorage.setItem('brainstorm_workflow_data', s);
  }, JSON.stringify(seedState()));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);
  await page.click('.bw-station[data-stage="4"] .bw-station-card');
  await page.waitForTimeout(600);
  await page.click('[data-next="4"]');
  await page.waitForTimeout(700);
  await waitBots(page, 1);
  turns = 0;
}
async function say(text) {
  turns++;
  await page.fill('#bw-chat-input', text);
  await page.keyboard.press('Enter');
  await waitBots(page, turns + 1);
}
const stored = async () => { await page.waitForTimeout(400); return page.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data'))); };
const lastBot = () => page.locator('.bw-msg-bot:not([data-typing])').last().textContent();
const railDone = () => page.locator('.bw-focus-step').evaluateAll(els => els.filter(e => e.dataset.state === 'done').length);
const gateOpen = async () => (await page.locator('[data-action="save-and-continue"]').count()) === 1;
const edits = () => page.locator('[data-edit-decision]').evaluateAll(els => els.map(e => e.getAttribute('data-edit-decision')));
async function deployPrompt() {
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(700);
  await page.click('.bw-station[data-stage="5"] .bw-station-card').catch(() => {});
  await page.waitForTimeout(500);
  if (await page.locator('#bw-lesson-next').count()) await page.click('#bw-lesson-next');
  await page.waitForTimeout(500);
  return page.inputValue('#bw-prompt-v2');
}

try {
  await openRefine();
  check('no Edit control is offered while a decision is still open', (await edits()).length === 0, String(await edits()));
  for (const k of ['handoff', 'keep', 'output', 'context']) await say(ANSWERS[k]);
  check('all four settled', await railDone() === 4 && await gateOpen(), String(await railDone()));
  check('each settled decision now has its own Edit control, in order',
    (await edits()).join(',') === 'handoff,keep,output,context', (await edits()).join(','));
  const labels = await page.locator('[data-edit-decision]').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
  check('and each is named for what it edits, for a screen reader',
    labels.join('|') === 'Edit: What AI handles|Edit: What stays yours|Edit: What good looks like|Edit: What AI needs to know', labels.join('|'));

  // ---- a free-form correction after completion is honest about what it did ----
  await say(CORRECTION);
  const reply = await lastBot();
  check('the reply does not claim the decision was updated', !/folded that in|updated|got it/i.test(reply), reply);
  check('it says it was added as extra context', /added as extra context/i.test(reply), reply);
  check('it says the four decisions were not changed', /four decisions were not changed/i.test(reply), reply);
  check('and points at the Edit control', /press Edit beside it/i.test(reply), reply);
  let d = await stored();
  check('the settled handoff answer is untouched by free text', d.botAnswers.handoff === STALE_HANDOFF, d.botAnswers.handoff);
  check('the correction is kept as a note', d.botAnswers.notes.includes(CORRECTION), JSON.stringify(d.botAnswers.notes));
  check('and nothing was reopened by it', await railDone() === 4 && await gateOpen());

  // ---- Edit reopens that decision, by name, and only that one ----
  await page.click('[data-edit-decision="handoff"]');
  await page.waitForTimeout(400);
  const ask = await lastBot();
  check('Edit puts the coach back on that decision, quoting what was there',
    /revisit \*?\*?what ai handles/i.test(ask) && ask.includes('Compare each account to last month') &&
    /replaces that one/i.test(ask), ask);
  check('and asks that decision\'s own question', /which parts should AI take on or share with you/i.test(ask), ask);
  d = await stored();
  check('only that decision is open again', d.decided.handoff === undefined && d.decided.keep && d.decided.output && d.decided.context,
    JSON.stringify(d.decided));
  check('so the rail shows three of four and Deploy is not on offer', await railDone() === 3 && !(await gateOpen()));
  check('the old answer stays until replaced, so abandoning the edit loses nothing', d.botAnswers.handoff === STALE_HANDOFF, d.botAnswers.handoff);

  // ---- the next answer REPLACES it through the ordinary capture ----
  turns += 1;   // the Edit message is a coach turn the helper did not send
  await say(REPLACEMENT);
  d = await stored();
  check('the decision\'s answer is replaced, not appended to', d.botAnswers.handoff === REPLACEMENT, d.botAnswers.handoff);
  check('the other three are untouched',
    d.botAnswers.keep === ANSWERS.keep && d.botAnswers.output === ANSWERS.output && d.botAnswers.context === ANSWERS.context);
  check('Refine is complete again and Deploy is on offer', await railDone() === 4 && await gateOpen());

  // ---- what reaches the learner: the generated prompt ----
  const prompt = await deployPrompt();
  check('the generated prompt carries the replacement', prompt.includes(REPLACEMENT), prompt);
  check('and the retracted instruction is gone from it', !prompt.includes('sign off on the variances under the threshold'), prompt);
  check('the earlier free-form note is still there as context, as it was always meant to be', prompt.includes(CORRECTION), prompt);
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
