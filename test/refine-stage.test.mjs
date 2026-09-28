/*
 * Refine: the stage that turns a vision into an operating agreement.
 *
 * Stage 4 has four required decisions - what AI handles, what stays yours,
 * what good looks like, what AI needs to know - and they are the stage's state
 * model, not a byproduct of chatting. Three things follow from that, and this
 * file holds all three.
 *
 * Coverage, not turns. Deploy unlocks when all four have been ACCEPTED. A turn
 * count let a learner take the handoff with two sections never asked about, and
 * Deploy then opened on a prompt full of brackets. Accepted is not the same as
 * typed: the first thin answer is written down while the coach is still
 * challenging it, and only the second is settled - with [NEEDS DETAIL] if it is
 * still vague. Complete coverage, imperfect answers allowed.
 *
 * One progression, two coaches. The application owns which decision is current
 * and when it is satisfied. The scripted coach reads that state; a live model is
 * told about it and writes none of it. Before this, the live path captured
 * nothing at all - a coverage gate over those four keys would have trapped a
 * live learner in Refine forever, which is why the live half is tested here
 * rather than left to the endpoint suite.
 *
 * No prompt before Deploy. That is a product rule, so it is enforced rather
 * than requested: the scripted coach no longer prints one, the system prompt
 * says not to, and any fenced block in a Refine reply is stripped before the
 * learner reads it - which is the only version of the rule a live model cannot
 * break.
 */
import { serveSite, makeReporter, loadChromium, readLesson, seedState, waitBots, readActivity }
  from './helpers.mjs';
import { server as stub, state as stubState } from './coach-stub.mjs';

const chromium = await loadChromium();
const report = makeReporter('refine stage');
const check = report.check;

const PORT = 8171;
const STUB_PORT = 8172;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const DECISIONS = ['What AI handles', 'What stays yours', 'What good looks like',
                   'What AI needs to know'];
const ANSWERS = {
  handoff: 'Steps 1 and 3 — pull the numbers and draft the routine paragraphs of each update.',
  keep: 'The judgement about what to flag next week, and the final read before it goes out.',
  output: 'Four short paragraphs per client, under 200 words, no bullets, direct with no hedging.',
  context: 'Never invent a figure that is not in the export. Client names must match the roster.'
};

let ctx, page;
async function openRefine(opts = {}) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  page = await ctx.newPage();
  report.watch(page);
  await page.addInitScript(s => {
    localStorage.setItem('bw_started', '1');
    if (!localStorage.getItem('brainstorm_workflow_data')) {
      localStorage.setItem('brainstorm_workflow_data', s);
    }
  }, JSON.stringify(seedState(opts.seed || {})));
  await page.goto(`http://127.0.0.1:${opts.port || PORT}/`);
  await page.waitForTimeout(400);
  await page.click('.bw-station[data-stage="4"] .bw-station-card');
  await page.waitForTimeout(600);
  // Stage 4 opens on its panel; Continue is what hands the learner to the coach.
  await page.click('[data-next="4"]');
  await page.waitForTimeout(700);
  await waitBots(page, 1);
}

const rail = () => page.locator('.bw-focus-step .bw-focus-label').allTextContents();
const railDone = () => page.locator('.bw-focus-step').evaluateAll(
  els => els.filter(e => e.dataset.state === 'done').length);
const gateOpen = async () => (await page.locator('[data-action="save-and-continue"]').count()) === 1;
const lastBot = () => page.locator('.bw-msg-bot:not([data-typing])').last().textContent();
/* The save is debounced 250ms, and the scripted coach can answer faster than
   that, so a read of storage waits for the write rather than racing it. */
const stored = async () => {
  await page.waitForTimeout(400);
  return page.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data')));
};
let turns = 0;
async function say(text) {
  turns++;
  await page.fill('#bw-chat-input', text);
  await page.keyboard.press('Enter');
  await waitBots(page, turns + 1);
}

try {
  // ==================== the rail names the four up front ====================
  turns = 0;
  await openRefine();
  check('the rail lists the four decisions before any of them is reached',
    (await rail()).join(' | ') === DECISIONS.join(' | '), (await rail()).join(' | '));
  check('none of them is done yet', await railDone() === 0, String(await railDone()));
  check('and Deploy is not on offer', !(await gateOpen()));

  const opening = await lastBot();
  check('the opening reads the vision back in excerpt, not in full',
    opening.includes('already pictured the version you want') &&
    opening.includes('…'), opening.slice(0, 200));
  check('it does not dump the whole field into the first message',
    !opening.includes(seedState().idealOutcome), 'full outcome text was pasted in');
  /* The problem and the mapped steps are pinned in the cards directly above the
     transcript. The coach picking up from them beats reciting them back. */
  check('and it does not read the worksheet back',
    !opening.includes(seedState().problem) &&
    !opening.includes('Pull delivery numbers'), opening.slice(0, 200));
  check('while the cards above it still carry both',
    (await page.locator('[data-card="problem-summary"]').count()) === 1 &&
    (await page.locator('[data-card="specificity"]').count()) === 1);
  check('and it opens on the first decision, not a general question',
    /which parts should AI take on or share with you/i.test(opening), opening.slice(-140));

  // ==================== one decision, one rail item ====================
  await say(ANSWERS.handoff);
  check('settling one decision checks exactly one rail item',
    await railDone() === 1, String(await railDone()));
  check('and the coach moves to the next one in order',
    /what stays yours|not take over/i.test(await lastBot()), (await lastBot()).slice(-160));
  check('which is recorded as decided, not merely stored',
    (await stored()).decided.handoff === true &&
    (await stored()).decided.keep === undefined,
    JSON.stringify((await stored()).decided));

  // ==================== a thin answer is challenged, not banked ====================
  await say('idk');
  check('a first thin answer does not complete its decision',
    await railDone() === 1, String(await railDone()));
  check('the coach pushes back instead of moving on',
    /make that boundary concrete/i.test(await lastBot()), (await lastBot()).slice(0, 140));
  check('and the push-back teaches the idea rather than performing',
    !/keep you up at night|that's a vibe/i.test(await lastBot()), (await lastBot()).slice(0, 140));
  let d = await stored();
  check('the words are kept in case they stop there',
    d.botAnswers.keep === 'idk', JSON.stringify(d.botAnswers.keep));
  check('but the decision is still open', d.decided.keep === undefined,
    JSON.stringify(d.decided));

  await say('still not sure really');
  check('the second thin answer is accepted rather than asked a third time',
    await railDone() === 2, String(await railDone()));
  check('and the coach says plainly that it is marking it',
    /needing more detail/i.test(await lastBot()) && /spot it in Deploy/i.test(await lastBot()),
    (await lastBot()).slice(0, 140));
  check('the decision is settled', (await stored()).decided.keep === true);

  // ==================== turns are not the gate ====================
  /* Thin answers cost two messages each and settle one decision, so the message
     count and the decision count come apart. That gap is the whole point: the
     gate reads decisions. */
  await say('good');
  await say('nice and clean');
  check('two more messages settled one more decision, not two',
    await railDone() === 3, String(await railDone()));
  check('so five messages in, Deploy is still shut with a decision open',
    !(await gateOpen()) && await page.locator('.bw-msg-user').count() === 5,
    'user msgs=' + await page.locator('.bw-msg-user').count() +
    ' done=' + await railDone());

  await say(ANSWERS.context);
  check('settling the last one is what opens it', await gateOpen(),
    'rail done=' + await railDone());
  check('and the rail shows every item done', await railDone() === 4,
    String(await railDone()));

  // ==================== it closes on a recap, not a prompt ====================
  const closing = await lastBot();
  /* Named with the rail's own labels, so the close lands on the four things the
     learner watched tick off rather than four new words for them. */
  check('the coach recaps the four decisions',
    closing.includes('You\'ve made all four decisions: what AI handles, what stays yours, ' +
      'what good looks like, and what AI needs to know.'), closing.slice(0, 200));
  check('and sends them to Deploy', /continue to deploy/i.test(closing), closing.slice(-90));
  check('no prompt appears anywhere in the conversation',
    !/## CONTEXT|```/.test(await page.locator('.bw-chat-log').textContent()));
  check('not even a fenced block', await page.locator('.bw-chat-log pre').count() === 0);

  // ==================== restart re-closes the gate ====================
  await page.click('#bw-coach-restart');
  await page.click('#bw-coach-restart');     // inline confirm
  await waitBots(page, 1);
  check('restarting Refine clears every decision',
    await railDone() === 0, String(await railDone()));
  check('and re-locks Deploy', !(await gateOpen()));
  d = await stored();
  check('the record is cleared too, not just the transcript',
    Object.keys(d.decided).length === 0 && !d.botAnswers.handoff,
    JSON.stringify(d.decided) + ' ' + JSON.stringify(d.botAnswers.handoff));
  check('including the memory of having pushed back, so a thin answer is challenged again',
    !d.pushedBack.keep, JSON.stringify(d.pushedBack));
  check('the map agrees Refine is unfinished', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('brainstorm_workflow_data')).progress.done['4'] !== true));

  /* The destructive case: restarting Refine AFTER it has been completed. The
     check above restarts before the handoff, so progress.done[4] was never
     true; here it is, and clearing the four decisions has to take the tick and
     Deploy's unlock with it. Otherwise a learner can throw the work away and
     still walk back into a finished prompt. */
  turns = 0;
  await openRefine();
  for (const key of ['handoff', 'keep', 'output', 'context']) await say(ANSWERS[key]);
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(800);
  let p4 = (await stored()).progress;
  check('finishing Refine ticks it and unlocks Deploy',
    p4.done['4'] === true && p4.unlocked >= 5, JSON.stringify(p4));
  check('and Deploy is reachable from the map', await page.evaluate(async () => {
    document.getElementById('bw-to-map').click();
    await new Promise(r => setTimeout(r, 600));
    return document.querySelector('.bw-station[data-stage="5"]').dataset.state !== 'locked';
  }));

  await page.click('.bw-station[data-stage="4"] .bw-station-card');
  await page.waitForTimeout(800);
  await page.click('#bw-coach-restart');
  await page.click('#bw-coach-restart');
  await waitBots(page, 1);
  check('restarting a finished Refine clears the four decisions',
    await railDone() === 0, String(await railDone()));
  p4 = (await stored()).progress;
  check('and un-ticks the stage', p4.done['4'] !== true, JSON.stringify(p4.done));
  check('and takes Deploy\'s unlock back with it', p4.unlocked <= 4, String(p4.unlocked));
  check('so the map no longer offers Deploy', await page.evaluate(async () => {
    document.getElementById('bw-to-map').click();
    await new Promise(r => setTimeout(r, 600));
    return document.querySelector('.bw-station[data-stage="5"]').dataset.state === 'locked';
  }));
  check('the stages before it are untouched', await page.evaluate(() =>
    [...document.querySelectorAll('.bw-station')].slice(0, 3)
      .every(e => e.dataset.state === 'completed')),
    await page.locator('.bw-station').evaluateAll(e => e.map(x => x.dataset.state).join(',')));

  // ==================== a scripted run reaches Deploy ====================
  turns = 0;
  await openRefine();
  for (const key of ['handoff', 'keep', 'output', 'context']) await say(ANSWERS[key]);
  check('four clean answers settle the four decisions', await railDone() === 4,
    String(await railDone()));
  check('in the order the rail promised', await page.evaluate(() => {
    const log = [...document.querySelectorAll('.bw-msg-bot')].map(e => e.textContent).join('\n');
    const at = re => log.search(re);
    return at(/which parts should AI take on/i) < at(/what stays yours/i) &&
           at(/what stays yours/i) < at(/set the bar/i) &&
           at(/set the bar/i) < at(/need to know or follow every time/i);
  }));
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(800);
  check('the handoff lands on Deploy',
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '5',
    await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage'));

  const v2 = await page.locator('#bw-prompt-v2').inputValue();
  check('Deploy is where the prompt first appears', v2.startsWith('## CONTEXT'), v2.slice(0, 40));
  const heads = v2.match(/^## .+$/gm) || [];
  check('still the same six sections', heads.length === 6 && heads.join('|') ===
    '## CONTEXT|## WHAT I NEED YOU TO DO|## WHAT STAYS WITH ME|## OUTPUT I EXPECT|' +
    '## THINGS YOU NEED TO KNOW|## HOW TO WORK WITH ME', heads.join('|'));
  check('built from the four decisions',
    v2.includes('draft the routine paragraphs') && v2.includes('under 200 words') &&
    v2.includes('what to flag next week') && v2.includes('match the roster'));
  check('with nothing left in brackets',
    !/\[Name the steps|\[Format, length|\[Facts, constraints/.test(v2));
  check('and the note says where it came from, rather than apologising for the coach',
    (await page.locator('#bw-v2-source').textContent())
      .includes('Built from the decisions you made in Refine'),
    await page.locator('#bw-v2-source').textContent());

  // ==================== no prompt in stages 1 to 4, after a finished Refine ====================
  await page.click('#bw-to-map');
  await page.waitForTimeout(600);
  const seen = [];
  for (const stage of [1, 2, 3, 4]) {
    await page.click(`.bw-station[data-stage="${stage}"] .bw-station-card`);
    await page.waitForTimeout(700);
    await readLesson(page);
    const text = await page.locator('#bw-stage').textContent();
    if (/## CONTEXT|## WHAT I NEED YOU TO DO/.test(text)) seen.push('stage ' + stage);
    if (await page.locator('#bw-prompt-v1').isVisible()) seen.push('stage ' + stage + ' draft');
    await page.click('#bw-to-map');
    await page.waitForTimeout(550);
  }
  check('a finished Refine still shows no prompt before Deploy', seen.length === 0,
    seen.join(', '));

  /* ============ opening a v3 save: only real acceptance carries over ============

     v3 stored a first thin answer and set pushedBack, then waited for the
     second answer - the coach was still challenging it. Only acceptance moved
     mockProgress. Reading text-plus-pushedBack as settled would promote a
     half-answered question to a finished decision and hand the learner an
     unlocked Deploy for work they never did. */
  const v3Save = over => ({
    version: 3,
    problem: 'Every Monday I rebuild eleven client status decks by hand and it eats the morning.',
    steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
            { action: 'Draft each client update', tools: 'Word' }],
    toolsAll: ['Tableau', 'Word'],
    idealOutcome: 'The decks go out before lunch without me rebuilding each one by hand.',
    aiRole: 'Assemble the routine parts so I am reviewing rather than retyping.',
    masterPromptV1: '', masterPromptV2: '', v2Source: '',
    conversations: {}, mockProgress: {},
    botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
    pushedBack: {},
    progress: { current: 4, unlocked: 4, done: { 1: true, 2: true, 3: true },
                entered: { 1: true, 2: true, 3: true } },
    ...over
  });

  async function openV3(save) {
    if (ctx) await ctx.close();
    ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    page = await ctx.newPage();
    report.watch(page);
    await page.addInitScript(x => {
      localStorage.setItem('bw_started', '1');
      localStorage.setItem('brainstorm_workflow_data', x);
    }, JSON.stringify(save));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForTimeout(600);
    return page.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data')));
  }

  // Mid-challenge: the answer is down, the push-back has been made, the cursor
  // has not moved. That decision is not settled.
  let up = await openV3(v3Save({
    botAnswers: { handoff: 'faster', output: '', keep: '', context: '', notes: [] },
    pushedBack: { handoff: true },
    mockProgress: { all: 0 }
  }));
  check('a v3 save is upgraded rather than discarded', up.version === 4, String(up.version));
  check('a first thin answer that was still being challenged is not settled',
    up.decided.handoff !== true, JSON.stringify(up.decided));
  check('the words are kept, so the learner is not retyping from nothing',
    up.botAnswers.handoff === 'faster', up.botAnswers.handoff);
  check('and Refine is still open', up.progress.done['4'] !== true,
    JSON.stringify(up.progress.done));

  // The same thin words, but accepted on the second pass: the cursor moved.
  up = await openV3(v3Save({
    botAnswers: { handoff: 'faster', output: '', keep: '', context: '', notes: [] },
    pushedBack: { handoff: true },
    mockProgress: { all: 1 }
  }));
  check('a thin answer that was actually accepted does carry over',
    up.decided.handoff === true, JSON.stringify(up.decided));
  check('and nothing after it is credited',
    !up.decided.output && !up.decided.keep && !up.decided.context,
    JSON.stringify(up.decided));

  // A finished v3 Refine, in v3's own order: handoff, output, keep, context.
  up = await openV3(v3Save({
    botAnswers: { handoff: 'Steps 1 and 3, the drafting.', output: 'Four short paragraphs.',
                  keep: 'The judgement call at the end.', context: 'Never invent a figure.',
                  notes: [] },
    mockProgress: { all: 4 }
  }));
  check('a finished v3 Refine carries all four across',
    ['handoff', 'keep', 'output', 'context'].every(k => up.decided[k] === true),
    JSON.stringify(up.decided));

  /* v3's cursor order was handoff, output, keep, context - not the order Refine
     asks in now. A cursor of 2 means the first two of THAT list. */
  up = await openV3(v3Save({
    botAnswers: { handoff: 'Steps 1 and 3, the drafting.', output: 'Four short paragraphs.',
                  keep: '', context: '', notes: [] },
    mockProgress: { all: 2 }
  }));
  check('and the old cursor is read against the order it was written in',
    up.decided.handoff === true && up.decided.output === true &&
    !up.decided.keep && !up.decided.context, JSON.stringify(up.decided));

  // ==================== what a live model is told ====================
  const src = readActivity();
  const sys = src.slice(src.indexOf('var BOT_SYSTEM_PROMPT'), src.indexOf('2. STATE + PERSISTENCE'));
  check('the system prompt no longer asks a live coach to emit the prompt in Refine',
    !/reply with a short summary and then the finished prompt/i.test(sys) &&
    /Do NOT write out, quote, preview or otherwise show the finished master prompt/.test(sys));
  check('it names all four decisions',
    ['WHAT AI HANDLES', 'WHAT STAYS THEIRS', 'WHAT GOOD LOOKS LIKE', 'WHAT AI NEEDS TO KNOW']
      .every(d => sys.includes(d)));
  check('tells it to take one at a time and not decide completion itself',
    /Ask about the current decision and nothing else/.test(sys) &&
    /do not decide on their behalf that a decision is settled/.test(sys));
  check('not to invent a different vision',
    /Do not propose a different vision/.test(sys));
  check('and to recap and hand on rather than finishing early',
    /give a short\s+recap/i.test(sys) && /Deploy stage/.test(sys));
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

// ==================== the live path captures too ====================
/* The bug this half exists for: before the decision machine, a live coach's
   replies were appended to the transcript and nothing was written down, so a
   gate over the four keys could never be satisfied in live mode. */
let liveServer, liveCtx;
try {
  await new Promise(r => stub.listen(STUB_PORT, r));
  stubState.mode = 'reply';
  liveServer = await serveSite(8173, { botEndpoint: `"http://127.0.0.1:${STUB_PORT}/coach"` });
  liveCtx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const lp = await liveCtx.newPage();
  report.watch(lp);
  await lp.addInitScript(s => {
    localStorage.setItem('bw_started', '1');
    localStorage.setItem('brainstorm_workflow_data', s);
  }, JSON.stringify(seedState()));
  await lp.goto('http://127.0.0.1:8173/');
  await lp.waitForTimeout(400);
  await lp.click('.bw-station[data-stage="4"] .bw-station-card');
  await lp.waitForTimeout(500);
  await lp.click('[data-next="4"]');
  await lp.waitForTimeout(900);
  await waitBots(lp, 1);

  const lRailDone = () => lp.locator('.bw-focus-step').evaluateAll(
    els => els.filter(e => e.dataset.state === 'done').length);
  const lGate = async () => (await lp.locator('[data-action="save-and-continue"]').count()) === 1;
  let lTurns = 0;
  const lSay = async t => {
    lTurns++;
    await lp.fill('#bw-chat-input', t);
    await lp.keyboard.press('Enter');
    await waitBots(lp, lTurns + 1);
  };

  check('a live coach gets the same four-item rail',
    await lp.locator('.bw-focus-step').count() === 4);
  await lSay(ANSWERS.handoff);
  check('the application writes the decision down, not the model',
    await lRailDone() === 1, String(await lRailDone()));
  await lSay('idk');
  check('and holds the same push-once rule in live mode',
    await lRailDone() === 1, String(await lRailDone()));
  await lSay(ANSWERS.keep);
  await lSay(ANSWERS.output);
  check('Deploy stays shut while a decision is open', !(await lGate()));

  /* The stub now answers with a fenced master prompt, which is exactly what a
     live model ignoring its instructions would do. */
  stubState.mode = 'anthropic';
  await lSay(ANSWERS.context);
  check('a live run can complete all four rather than being trapped',
    await lRailDone() === 4, String(await lRailDone()));
  check('and Deploy unlocks for it', await lGate());
  check('a prompt a live model emits anyway never reaches the learner',
    !/## CONTEXT|master-prompt/.test(await lp.locator('.bw-chat-log').textContent()),
    (await lp.locator('.bw-chat-log').textContent()).slice(-120));

  /* The filter suppresses prompts, not fenced content. A coach discussing
     standards may legitimately show a format sample; losing it would be
     collateral damage from a rule that was never about code blocks. */
  stubState.mode = 'untagged';
  await lSay('What about an untagged one?');
  check('an untagged block that looks like the prompt is removed too',
    !/## CONTEXT|## OUTPUT I EXPECT/.test(await lp.locator('.bw-chat-log').textContent()),
    (await lp.locator('.bw-chat-log').textContent()).slice(-140));
  check('and the prose around it survives',
    (await lp.locator('.bw-msg-bot').last().textContent()).includes('Something like this'),
    await lp.locator('.bw-msg-bot').last().textContent());

  stubState.mode = 'fencedJson';
  await lSay('Could you show me the shape?');
  const jsonReply = await lp.locator('.bw-msg-bot').last().textContent();
  check('an ordinary fenced example is left alone',
    jsonReply.includes('"tone": "direct"') && jsonReply.includes('Does that match'),
    jsonReply.slice(0, 160));
  check('and still renders as a block rather than being flattened',
    await lp.locator('.bw-msg-bot').last().locator('pre').count() === 1,
    String(await lp.locator('.bw-msg-bot').last().locator('pre').count()));
  check('nor does it leak into the transcript it would be lifted from later',
    await lp.evaluate(() => !JSON.parse(localStorage.getItem('brainstorm_workflow_data'))
      .conversations.all.some(m => /## CONTEXT/.test(m.text))));

  await lp.waitForTimeout(400);
  const lد = await lp.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data')));
  check('all four answers were captured from the learner, not the model',
    ['handoff', 'keep', 'output', 'context'].every(k => lد.botAnswers[k] &&
      !/Live reply|OpenAI-shaped/.test(lد.botAnswers[k])),
    JSON.stringify(lد.botAnswers).slice(0, 150));

  /* No wire-contract change was needed for any of this: the decision state
     rides inside the context payload the endpoint already receives. */
  const sent = stubState.requests[stubState.requests.length - 1];
  check('the coach is told where the conversation is up to, inside the existing payload',
    /where this conversation is up to/.test(sent.context || ''),
    Object.keys(sent).join(','));
  check('and the payload has the same four fields it always had',
    ['system', 'context', 'messages'].every(k => k in sent), Object.keys(sent).join(','));
} catch (e) {
  report.fail('LIVE THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
if (liveCtx) await liveCtx.close();
if (liveServer) liveServer.close();
stub.close();
server.close();
process.exit(passed ? 0 : 1);
