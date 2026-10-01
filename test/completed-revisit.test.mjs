/*
 * Reopening a stage you have already completed.
 *
 * The first time through, a stage opens on its reading and then hands over to the
 * work: that is the instruction, and it belongs to the first run. Coming back is a
 * different job. Someone reopening a finished stage is there for the thing they made
 * or decided - the conversation, the workflow, the vision, the prompt - and used to be
 * walked back through the lesson they had already read to get to it. The completed
 * journey even says "Open Deploy to copy your master prompt again", and that landed on
 * the Deploy reading rather than the prompt.
 *
 * So the rule is one sentence, and it is the same in every stage: once a stage is
 * completed, reopening it takes the learner to what they created there.
 *
 *   Identify -> the completed conversation      Refine -> the completed conversation
 *   Map      -> the populated workflow form     Envision -> the populated vision form
 *   Deploy   -> the master prompt
 *
 * Deliberately NOT here: a "review the lesson" control or any other new navigation. The
 * reading stays part of the first run; this is only about what a revisit lands on.
 */
import { serveSite, makeReporter, loadChromium, seedState } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('completed revisit');
const check = report.check;

const PORT = 8185;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const STEPS = [{ action: 'Pull last week\'s delivery numbers', tools: 'Tableau' },
               { action: 'Draft a four paragraph update for each client', tools: 'Word' }];
const CONVOS = {
  identify: [{ role: 'bot', text: 'What is the task you want to hand off?', at: '9:00 AM' },
             { role: 'user', text: 'Every Monday I build eleven status updates by hand.', at: '9:01 AM' },
             { role: 'bot', text: 'That is enough to work from.', at: '9:01 AM' }],
  all: [{ role: 'bot', text: 'Which parts should AI take on?', at: '9:10 AM' },
        { role: 'user', text: 'The first draft of each update.', at: '9:11 AM' },
        { role: 'bot', text: 'And what stays with you?', at: '9:11 AM' }]
};
const ANSWERS = { handoff: 'Drafting the four paragraph update for each client.',
  output: 'Four short paragraphs, no bullets, under two hundred words.',
  keep: 'The call on what to flag next week stays mine.',
  context: 'Never invent a number that is not in the export.', notes: [] };
const DECIDED = { handoff: true, keep: true, output: true, context: true };

const doneUpTo = k => { const d = {}; for (let i = 1; i <= k; i++) d[i] = true; return d; };

/* A learner at the Journey with everything up to `through` completed. */
async function atJourney(through, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  report.watch(page);
  const seed = seedState({
    steps: STEPS, toolsAll: ['Tableau', 'Word'],
    conversations: { ...seedState().conversations, ...CONVOS },
    botAnswers: ANSWERS, decided: DECIDED,
    progress: { unlocked: Math.min(5, through + 1), current: Math.min(5, through + 1),
                done: doneUpTo(through),
                entered: doneUpTo(Math.min(5, through + 1)) },
    ...(opts.seed || {})
  });
  await page.addInitScript(s => {
    localStorage.setItem('bw_started', '1');
    localStorage.setItem('brainstorm_workflow_data', s);
  }, JSON.stringify(seed));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(500);
  return { ctx, page };
}

const open = async (page, n) => {
  await page.locator(`.bw-station[data-stage="${n}"] .bw-station-card`).click();
  await page.waitForTimeout(800);
};
const back = async page => { await page.click('#bw-to-map'); await page.waitForTimeout(700); };

/* What a learner is looking at: the reading, or their own work. */
const landing = page => page.evaluate(() => {
  const vis = e => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
  const bw = document.querySelector('.bw');
  return { phase: bw.getAttribute('data-phase'),
           reading: vis(document.getElementById('bw-lesson-body')),
           steps: vis(document.querySelector('.bw-steps')),
           chat: vis(document.getElementById('bw-chat-input')),
           turns: document.querySelectorAll('.bw-msg').length,
           cards: document.querySelectorAll('#bw-cards .bw-card').length,
           firstAction: (document.querySelector('#bw-cards .bw-card input') || {}).value || '',
           outcome: (document.getElementById('bw-ideal-outcome') || {}).value || '',
           prompt: (document.getElementById('bw-prompt-v2') || {}).value || '',
           promptShown: vis(document.getElementById('bw-prompt-v2')),
           copy: vis(document.getElementById('bw-copy-final')),
           lessonTitle: (document.getElementById('bw-lesson-title') || {}).textContent || '' };
});

try {
  // ============================ every stage, completed ============================
  let { ctx, page } = await atJourney(5);

  await open(page, 1);
  let l = await landing(page);
  check('Identify, completed: the conversation, not the reading',
    l.phase === 'chat' && l.chat && l.turns >= 3 && !l.reading, JSON.stringify(l));
  check('and it is the conversation they had', await page.locator('.bw-msg-user .bw-msg-body').first().textContent()
    .then(t => t.includes('eleven status updates')));
  await back(page);

  await open(page, 2);
  l = await landing(page);
  check('Map, completed: the populated workflow form, not the reading',
    !l.reading && l.steps && l.cards === 2 && /delivery numbers/.test(l.firstAction), JSON.stringify(l));
  await back(page);

  await open(page, 3);
  l = await landing(page);
  check('Envision, completed: the populated vision form, not the reading',
    !l.reading && l.steps && /\S/.test(l.outcome), JSON.stringify(l));
  await back(page);

  await open(page, 4);
  l = await landing(page);
  check('Refine, completed: the conversation, not the work page',
    l.phase === 'chat' && l.chat && l.turns >= 3 && !l.reading, JSON.stringify(l));
  await back(page);

  await open(page, 5);
  l = await landing(page);
  check('Deploy, completed: the master prompt itself, not the reading',
    !l.reading && l.promptShown && /## CONTEXT/.test(l.prompt), JSON.stringify({ ...l, prompt: l.prompt.slice(0, 40) }));
  check('and the thing the journey told them to come back for - Copy - is right there', l.copy, JSON.stringify(l));
  await ctx.close();

  // ============================ the reading is still the first run ============================
  /* Stage 3 is current, not completed: the reading comes first, exactly as before. */
  ({ ctx, page } = await atJourney(2));
  await open(page, 3);
  l = await landing(page);
  check('a stage that is not completed still opens on its reading',
    l.reading && !l.steps && /better version/i.test(l.lessonTitle), JSON.stringify(l));
  await page.click('#bw-lesson-next');
  await page.waitForTimeout(500);
  l = await landing(page);
  check('and Continue still hands over to the work', !l.reading && l.steps, JSON.stringify(l));
  await back(page);

  /* Deploy reached for the first time is also the reading first - completed means
     Finish was pressed, not that the stage was opened. */
  await ctx.close();
  ({ ctx, page } = await atJourney(4));
  await open(page, 5);
  l = await landing(page);
  check('Deploy opened for the first time still starts on its reading',
    l.reading && !l.promptShown, JSON.stringify({ ...l, prompt: '' }));
  await ctx.close();

  // ============================ moving between completed stages ============================
  ({ ctx, page } = await atJourney(5));
  await open(page, 2);
  await page.click('[data-next="2"]');
  await page.waitForTimeout(800);
  l = await landing(page);
  check('from a completed Map, Next lands on the completed Envision form too',
    !l.reading && l.steps && /\S/.test(l.outcome), JSON.stringify(l));
  /* The mini-node strip is the other way between stages. */
  await page.locator('#bw-mini button[aria-label^="Stage 2,"]').click();
  await page.waitForTimeout(800);
  l = await landing(page);
  check('and so does the strip across the top: completed Map, populated form',
    !l.reading && l.steps && l.cards === 2, JSON.stringify(l));
  await ctx.close();

  // ============================ completion that no longer holds ============================
  /* Self-correction un-ticks a stage whose answer has gone: with no workflow steps,
     Map is not completed any more, so it is a first run again - reading first. */
  ({ ctx, page } = await atJourney(2, { seed: { steps: [{ action: '', tools: '' }, { action: '', tools: '' }] } }));
  await open(page, 2);
  l = await landing(page);
  check('a stage that stopped being complete is a first run again: reading first',
    l.reading, JSON.stringify(l));
  await ctx.close();

  // ============================ on a phone, same thing ============================
  ({ ctx, page } = await atJourney(5, { viewport: { width: 390, height: 780 } }));
  await open(page, 5);
  l = await landing(page);
  check('390: Deploy, completed, is the prompt', !l.reading && l.promptShown && l.copy, JSON.stringify({ ...l, prompt: '' }));
  await back(page);
  await open(page, 2);
  l = await landing(page);
  check('390: Map, completed, is the populated form', !l.reading && l.cards === 2, JSON.stringify(l));
  await ctx.close();

  // ============================ what completion does not reach ============================
  /* The journey's own hint is the contract: "Open Deploy to copy your master prompt again". */
  ({ ctx, page } = await atJourney(5));
  check('the completed journey tells them to open Deploy to copy again',
    /Open Deploy to copy your master prompt again/.test(await page.locator('#bw-map-hint').textContent()));
  await open(page, 5);
  await page.click('#bw-copy-final');
  await page.waitForTimeout(400);
  check('and from one tap on Deploy they can', /Copied|copy/i.test(await page.locator('#bw-copy-status').textContent()),
    await page.locator('#bw-copy-status').textContent());
  await ctx.close();
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
