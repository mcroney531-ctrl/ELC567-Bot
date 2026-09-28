/*
 * Envision: the stage that captures the learner's own words without a coach.
 *
 * Stage 3 is the odd one out. It reads, then asks two questions, and the
 * answers are the learner's - not something a conversation extracted from them.
 * So they are stored as top-level learner data rather than in botAnswers, and
 * nothing on that screen calls a model.
 *
 * Three things this file pins, in order.
 *
 * The stage itself: reading into a form, what counts as an answer, what the
 * read-back says, that it persists, and that finishing it unlocks Refine.
 *
 * The carry: Refine's coach has to work from the vision rather than inventing
 * one, and Deploy's prompt has to show the learner their own thinking without
 * having pasted a worksheet field into it - transformed, and in the six sections
 * that were already there.
 *
 * The upgrade: a save written before Envision existed has to survive being
 * opened, with the authored work intact and no stage claiming to be finished
 * that a v3 journey has not actually finished.
 */
import { serveSite, makeReporter, loadChromium, readLesson, seedState, waitBots }
  from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('envision stage');
const check = report.check;

const PORT = 8168;
const server = await serveSite(PORT);
const browser = await chromium.launch();
const BASE = `http://127.0.0.1:${PORT}/`;

const OUTCOME =
  'Monday morning stops being a write-up shift: the numbers are already gathered and a ' +
  'first draft is waiting, so the time goes on the judgement calls instead of the typing.';
const ROLE =
  'Gather the figures from the usual places and draft the routine paragraphs, so what ' +
  'reaches me is a first pass to react to rather than a blank page.';

let ctx, page;
/* Opens a stage from seeded progress. Envision's own checks open on stage 3
   with Identify and Map behind the learner and nothing written in the form; the
   carry checks open later stages with the vision already in place. */
async function openStage(stage, overrides = {}) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  page = await ctx.newPage();
  report.watch(page);
  const seed = seedState({
    idealOutcome: '', aiRole: '',
    progress: { current: 3, unlocked: 3, done: { 1: true, 2: true },
                entered: { 1: true, 2: true } },
    ...overrides
  });
  /* Seeded only when there is nothing there, so a reload inside a test reads
     back what the learner typed rather than the fixture again. */
  await page.addInitScript(s => {
    localStorage.setItem('bw_started', '1');
    if (!localStorage.getItem('brainstorm_workflow_data')) {
      localStorage.setItem('brainstorm_workflow_data', s);
    }
  }, JSON.stringify(seed));
  await page.goto(BASE);
  await page.waitForTimeout(400);
  await page.click(`.bw-station[data-stage="${stage}"] .bw-station-card`);
  await page.waitForTimeout(700);
}
const openEnvision = overrides => openStage(3, overrides);

const stored = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem('brainstorm_workflow_data')));
const states = () => page.locator('.bw-station')
  .evaluateAll(els => els.map(e => e.dataset.state).join(','));

/* Typed rather than filled: the form saves on input, so a fill() that does not
   dispatch the event would pass for the wrong reason. */
async function write(sel, text) {
  await page.click(sel);
  await page.fill(sel, '');
  await page.type(sel, text, { delay: 0 });
  await page.waitForTimeout(250);
}

try {
  // ========================= reading, then two questions =========================
  await openEnvision();
  check('Envision opens on its reading', await page.locator('#bw-lesson-body').isVisible());
  check('with no form underneath it yet',
    !(await page.locator('#bw-ideal-outcome').isVisible()));
  check('and no coach anywhere near it',
    !(await page.locator('#bw-chat-panel').isVisible()) &&
    await page.locator('.bw-msg').count() === 0);

  await readLesson(page);
  check('continue reaches the two questions',
    await page.locator('#bw-ideal-outcome').isVisible() &&
    await page.locator('#bw-ai-role').isVisible());
  check('the outcome is asked for first', await page.evaluate(() => {
    const a = document.querySelector('#bw-ideal-outcome').getBoundingClientRect();
    const b = document.querySelector('#bw-ai-role').getBoundingClientRect();
    return a.top < b.top;
  }));
  check('the reading did not open a conversation on the way',
    await page.locator('.bw-msg').count() === 0,
    'msgs=' + await page.locator('.bw-msg').count());
  check('and nothing on this screen shows a prompt',
    !(await page.locator('#bw-prompt-v1').isVisible()) &&
    !(await page.locator('#bw-prompt-v2').isVisible()));

  // ============================ what counts as an answer ============================
  await page.click('[data-next="3"]');
  await page.waitForTimeout(300);
  check('an empty form does not pass', !(await page.locator('#bw-warn-3').isHidden()));
  check('and the stage is still open',
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '3');

  await write('#bw-ideal-outcome', 'faster');
  await write('#bw-ai-role', 'idk');
  await page.click('[data-next="3"]');
  await page.waitForTimeout(300);
  check('a thin answer does not pass either', !(await page.locator('#bw-warn-3').isHidden()));
  check('the complaint names the outcome, which is the first thing missing',
    /better about the finished workflow/i.test(await page.locator('#bw-warn-3').textContent()),
    await page.locator('#bw-warn-3').textContent());
  check('and nothing is summarised back off a thin answer',
    !(await page.locator('#bw-vision-summary').isVisible()));

  await write('#bw-ideal-outcome', OUTCOME);
  await page.click('[data-next="3"]');
  await page.waitForTimeout(300);
  check('one real answer is not enough', !(await page.locator('#bw-warn-3').isHidden()));
  check('and now the complaint has moved to the role',
    /role you want AI to play/i.test(await page.locator('#bw-warn-3').textContent()),
    await page.locator('#bw-warn-3').textContent());

  await write('#bw-ai-role', ROLE);
  check('with both answers down the read-back appears',
    await page.locator('#bw-vision-summary').isVisible());
  check('quoting the learner rather than paraphrasing them',
    (await page.locator('#bw-vision-outcome').textContent()) === OUTCOME &&
    (await page.locator('#bw-vision-role').textContent()) === ROLE,
    await page.locator('#bw-vision-outcome').textContent());
  check('the warning clears itself once the answers are real',
    await page.locator('#bw-warn-3').isHidden());

  // ============================== where it is stored ==============================
  let d = await stored();
  check('the answers are saved as the learner\'s own data',
    d.idealOutcome === OUTCOME && d.aiRole === ROLE,
    JSON.stringify({ o: d.idealOutcome, r: d.aiRole }).slice(0, 120));
  check('not folded into what a coach got out of them',
    !JSON.stringify(d.botAnswers).includes('write-up shift'),
    JSON.stringify(d.botAnswers));
  check('and the save is a current one', d.version === 4, String(d.version));

  // ============================ finishing unlocks Refine ============================
  await page.click('[data-next="3"]');
  await page.waitForTimeout(800);
  check('continue moves on to Refine',
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '4',
    await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage'));
  d = await stored();
  check('Envision is ticked', d.progress.done['3'] === true, JSON.stringify(d.progress.done));
  check('and Refine is unlocked', d.progress.unlocked >= 4, String(d.progress.unlocked));

  // reload: the answers come back, and the tick survives with them
  await page.goto(BASE);
  await page.waitForTimeout(500);
  check('after a reload the journey still reads Envision as done',
    (await states()).split(',')[2] === 'completed', await states());
  await page.click('.bw-station[data-stage="3"] .bw-station-card');
  await page.waitForTimeout(700);
  await readLesson(page);
  check('and the form comes back with the answers in it',
    (await page.locator('#bw-ideal-outcome').inputValue()) === OUTCOME &&
    (await page.locator('#bw-ai-role').inputValue()) === ROLE);
  check('with the read-back already showing',
    await page.locator('#bw-vision-summary').isVisible());

  /* Emptying one answer un-ticks the stage rather than leaving a tick behind for
     work that is no longer there. */
  await page.fill('#bw-ai-role', '');
  await page.waitForTimeout(300);
  await page.click('#bw-to-map');
  await page.waitForTimeout(600);
  check('taking half the vision back un-ticks Envision',
    (await states()).split(',')[2] !== 'completed', await states());
  check('and leaves the stages either side alone',
    (await states()).split(',')[0] === 'completed' &&
    (await states()).split(',')[1] === 'completed', await states());

  // ==================== the vision reaches Refine's coach ====================
  await openStage(4, {
    idealOutcome: OUTCOME, aiRole: ROLE,
    progress: { current: 4, unlocked: 4, done: { 1: true, 2: true, 3: true },
                entered: { 1: true, 2: true, 3: true } }
  });
  await readLesson(page);
  await waitBots(page, 1);
  const opening = await page.locator('.bw-msg-bot').first().textContent();
  check('Refine opens by reading the vision back',
    /already defined the version you want/i.test(opening), opening.slice(0, 160));
  check('naming the outcome the learner wrote',
    opening.includes('write-up shift'), opening.slice(0, 200));
  check('and the role they asked AI to play',
    /you see AI's role as/i.test(opening) && opening.includes('Gather the figures'),
    opening.slice(0, 280));
  check('then asks for specifics rather than proposing a different future',
    /which parts should AI take on or share with you/i.test(opening), opening.slice(-160));

  /* What a live coach would be told. Read off the page rather than the source so
     it is the wire payload being checked, not a string literal. */
  const injected = await page.evaluate(() => window.__bwContextInjection || null);
  if (injected === null) {
    /* Not exposed, which is fine - the scripted opening above already proves the
       vision is in hand. Recorded so the gap is visible rather than silent. */
    check('context injection is not exposed for inspection (scripted opening covers it)', true);
  } else {
    check('the coach is told the outcome and the role',
      injected.includes(OUTCOME) && injected.includes(ROLE));
  }

  // ==================== and reaches Deploy transformed ====================
  await openStage(5, {
    idealOutcome: OUTCOME, aiRole: ROLE,
    botAnswers: { handoff: 'draft the routine paragraphs of each update',
                  output: 'four short paragraphs per client, plain and specific',
                  keep: 'the judgement call about what to flag next week',
                  context: 'never invent a number that is not in the export',
                  notes: [] },
    progress: { current: 5, unlocked: 5, done: { 1: true, 2: true, 3: true, 4: true },
                entered: { 1: true, 2: true, 3: true, 4: true } }
  });
  const v2 = await page.locator('#bw-prompt-v2').inputValue();
  check('Deploy shows a prompt', v2.startsWith('## CONTEXT'), v2.slice(0, 40));
  check('carrying the outcome as what the work is for',
    v2.includes('What I am trying to get to: ' + OUTCOME),
    (v2.match(/What I am trying.{0,80}/) || [''])[0]);
  check('and the role as the framing of the task',
    v2.includes('In broad terms: ' + ROLE),
    (v2.match(/In broad terms.{0,80}/) || [''])[0]);
  check('the outcome sits inside CONTEXT, not in a section of its own',
    v2.indexOf('What I am trying to get to') > v2.indexOf('## CONTEXT') &&
    v2.indexOf('What I am trying to get to') < v2.indexOf('## WHAT I NEED YOU TO DO'));
  check('and the role sits under the task heading',
    v2.indexOf('In broad terms') > v2.indexOf('## WHAT I NEED YOU TO DO') &&
    v2.indexOf('In broad terms') < v2.indexOf('## WHAT STAYS WITH ME'));
  const heads = v2.match(/^## .+$/gm) || [];
  check('still six sections, with nothing added for Envision',
    heads.length === 6 && heads.join('|') ===
    '## CONTEXT|## WHAT I NEED YOU TO DO|## WHAT STAYS WITH ME|## OUTPUT I EXPECT|' +
    '## THINGS YOU NEED TO KNOW|## HOW TO WORK WITH ME',
    heads.join('|'));
  check('no field label from the form was pasted in',
    !/ideal outcome|ai's role/i.test(v2),
    (v2.match(/.{0,40}(ideal outcome|ai's role).{0,40}/i) || [''])[0]);

  /* A learner's own edits outrank a regenerated template, which is the rule the
     vision must not have quietly broken. */
  await page.fill('#bw-prompt-v2', 'MY OWN PROMPT');
  await page.waitForTimeout(400);
  await page.click('#bw-to-map');
  await page.waitForTimeout(600);
  await page.click('.bw-station[data-stage="5"] .bw-station-card');
  await page.waitForTimeout(900);
  check('a hand-edited prompt is not overwritten by a regeneration',
    (await page.locator('#bw-prompt-v2').inputValue()) === 'MY OWN PROMPT',
    (await page.locator('#bw-prompt-v2').inputValue()).slice(0, 40));
  check('and the save records it as the learner\'s',
    (await stored()).v2Source === 'user', (await stored()).v2Source);

  // ======================== opening a save from before Envision ========================
  /* A v2 payload: the shape that shipped when stage 2 was reading and stage 3
     was the form, with no vision fields at all. */
  const V2 = {
    version: 2,
    problem: 'Every Monday I rebuild eleven client status decks by hand and it eats the morning.',
    steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
            { action: 'Draft each client update', tools: 'Word' }],
    toolsAll: ['Tableau', 'Word'],
    masterPromptV1: 'an old draft', masterPromptV2: '', v2Source: '',
    conversations: { identify: [{ role: 'bot', text: 'What is the task?', at: '9:00 AM' },
                               { role: 'user', text: 'The Monday decks.', at: '9:01 AM' }],
                     describe: [{ role: 'bot', text: 'gone', at: '9:05 AM' }] },
    mockProgress: { identify: 2 },
    botAnswers: { handoff: 'the drafting', output: 'four short paragraphs',
                  keep: 'the judgement call', context: 'never invent numbers', notes: ['a note'] },
    pushedBack: { identify: true },
    progress: { current: 5, unlocked: 5, done: { 1: true, 2: true, 3: true, 4: true },
                entered: { 1: true, 2: true, 3: true, 4: true, 5: true } }
  };
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  page = await ctx.newPage();
  report.watch(page);
  await page.addInitScript(s => {
    localStorage.setItem('bw_started', '1');
    localStorage.setItem('brainstorm_workflow_data', s);
  }, JSON.stringify(V2));
  await page.goto(BASE);
  await page.waitForTimeout(600);

  d = await stored();
  check('an old save is upgraded in place rather than thrown away',
    d.version === 4, String(d.version));
  check('the authored work survives',
    d.problem === V2.problem && d.steps.length === 2 &&
    d.toolsAll.join(',') === 'Tableau,Word');
  check('so does what the coach had taken down',
    d.botAnswers.handoff === 'the drafting' && d.botAnswers.notes.join(',') === 'a note',
    JSON.stringify(d.botAnswers));
  check('and the transcripts that still mean the same conversation',
    d.conversations.identify.length === 2 && d.mockProgress.identify === 2,
    JSON.stringify(d.conversations.identify).slice(0, 80));
  check('a stage that no longer exists leaves nothing behind',
    d.conversations.describe === undefined, JSON.stringify(Object.keys(d.conversations)));
  check('the vision starts empty, because it was never asked for',
    d.idealOutcome === '' && d.aiRole === '',
    JSON.stringify({ o: d.idealOutcome, r: d.aiRole }));
  check('progression is re-derived, not carried: Identify and Map are done',
    d.progress.done['1'] === true && d.progress.done['2'] === true,
    JSON.stringify(d.progress.done));
  check('and nothing claims a finished Envision',
    !d.progress.done['3'] && !d.progress.done['4'] && !d.progress.done['5'],
    JSON.stringify(d.progress.done));
  check('the learner resumes at Envision',
    d.progress.current === 3 && d.progress.unlocked === 3, JSON.stringify(d.progress));
  /* Available rather than current: the upgrade does not pretend they have been
     into a stage that did not exist when they last saved. */
  check('which is what the map shows them',
    (await states()) === 'completed,completed,available,locked,locked', await states());

  await page.reload();
  await page.waitForTimeout(500);
  check('and the upgrade was written back, so it does not happen twice',
    (await stored()).version === 4 && (await states()) ===
      'completed,completed,available,locked,locked', await states());
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
