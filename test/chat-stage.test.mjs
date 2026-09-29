/*
 * The coach phase: the conversational mode inside a learning stage.
 *
 * The things worth pinning are the ones the pack is emphatic about. It is a
 * mode inside the same product, not a second app - same shell, same mini-node
 * strip, same canonical state, no second navigation system. The canvas stays
 * pale. And the chat owns no copy of progression truth.
 */
import { serveSite, makeReporter, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('coach phase');
const check = report.check;

const PORT = 8157;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const SEED = {
  version: 3,
  problem: 'Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.',
  steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
          { action: 'Draft each client update', tools: 'Word' }],
  toolsAll: ['Tableau', 'Word'],
  masterPromptV1: '', masterPromptV2: '', v2Source: '',
  idealOutcome: 'The decks go out before lunch without me rebuilding each one by hand.',
  aiRole: 'Assemble the routine parts from the numbers so I am reviewing rather than retyping.',
  conversations: {}, mockProgress: {},
  botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] }
};

/* Opens stage 4 and walks into the coach, which is the flow: instructional
   content, Continue, coach. */
async function openCoach(opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 950 },
    reducedMotion: opts.reducedMotion
  });
  const page = await ctx.newPage();
  report.watch(page);
  await page.addInitScript(seed => {
    localStorage.setItem('brainstorm_workflow_data', seed);
    localStorage.setItem('bw_started', '1');
  }, JSON.stringify({
    ...SEED,
    progress: { unlocked: 4, current: 4, done: { 1: true, 2: true, 3: true },
                entered: { 1: true, 2: true, 3: true } }
  }));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);
  await page.click('.bw-station[data-stage="4"] .bw-station-card');
  await page.waitForTimeout(700);
  return { ctx, page };
}

/* Stage 1 with nothing behind it: the lesson screen, then its own coach.
   Nothing is seeded, because how the problem statement gets written is the
   thing under test. */
/* Everything finished, then back to an earlier stage - the state someone is in
   once they have reached the master prompt and started looking around. */
async function openFinished(stage) {
  const ctx = await browser.newContext({ viewport: { width: 880, height: 760 } });
  const page = await ctx.newPage();
  report.watch(page);
  await page.addInitScript(seed => {
    localStorage.setItem('brainstorm_workflow_data', seed);
    localStorage.setItem('bw_started', '1');
  }, JSON.stringify({
    ...SEED,
    // Long enough to wrap, because a real learner's steps do.
    steps: [{ action: "Pull last week's delivery numbers", tools: 'Tableau, Harvest' },
            { action: 'Check the shared inbox for anything unresolved', tools: 'Gmail' },
            { action: 'Draft a four paragraph update per client', tools: 'Word' },
            { action: "Reformat into each client's preferred channel", tools: 'Gmail, Slack' }],
    conversations: {
      identify: [{ role: 'bot', text: 'What is the task?', at: '9:00 AM' },
                 { role: 'user', text: 'The Monday status decks.', at: '9:01 AM' },
                 { role: 'bot', text: 'Noted.', at: '9:01 AM' },
                 { role: 'user', text: 'They go out before nine.', at: '9:02 AM' },
                 { role: 'bot', text: 'Got it.', at: '9:02 AM' }],
      all: [{ role: 'bot', text: 'What should the AI take on?', at: '9:10 AM' },
            { role: 'user', text: 'The first draft of each update.', at: '9:11 AM' },
            { role: 'bot', text: 'And what stays with you?', at: '9:11 AM' },
            { role: 'user', text: 'The judgment call at the end.', at: '9:12 AM' },
            { role: 'bot', text: 'Understood.', at: '9:12 AM' }]
    },
    progress: { unlocked: 5, current: 5, done: { 1: true, 2: true, 3: true, 4: true },
                entered: { 1: true, 2: true, 3: true, 4: true, 5: true } }
  }));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);
  await page.click(`.bw-station[data-stage="${stage}"] .bw-station-card`);
  await page.waitForTimeout(800);
  return { ctx, page };
}

/* The pinned rail against the conversation it is supposed to be serving. */
const railVsLog = page => page.evaluate(() => {
  const rail = document.querySelector('#bw-cards-top');
  const log = document.querySelector('.bw-chat-log');
  const r = rail.getBoundingClientRect(), l = log.getBoundingClientRect();
  return {
    railH: Math.round(r.height), logH: Math.round(l.height),
    panelH: Math.round(document.querySelector('#bw-chat-panel').getBoundingClientRect().height),
    overlap: Math.round(r.bottom - l.top),
    cards: rail.querySelectorAll('.bw-cc').length
  };
});

async function openStage1() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();
  report.watch(page);
  await page.addInitScript(() => localStorage.setItem('bw_started', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);
  await page.click('.bw-station[data-stage="1"] .bw-station-card');
  await page.waitForTimeout(700);
  return { ctx, page };
}

const say = async (page, text, n) => {
  await page.fill('#bw-chat-input', text);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    k => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= k, n,
    { timeout: 12000 });
};

try {
  let { ctx, page } = await openCoach();

  // ------------------- content first, then the coach -------------------
  check('a coaching stage opens on its instructional content',
    await page.locator('.bw-ls-work').isVisible() &&
    !(await page.locator('#bw-chat-panel').isVisible()));
  check('the conversation is not half-visible underneath it',
    !(await page.locator('#bw-chat-input').isVisible()));
  check('continue is labelled as the handoff it is',
    (await page.locator('[data-next="4"]').textContent()).toLowerCase().includes('coach'),
    await page.locator('[data-next="4"]').textContent());

  await page.click('[data-next="4"]');
  await page.waitForTimeout(800);
  check('continue opens the coach', await page.locator('#bw-chat-panel').isVisible());
  check('and puts the lesson away', !(await page.locator('.bw-ls-work').isVisible()));
  check('it did not advance the stage',
    (await page.locator('.bw-step:visible, .bw-step[data-state="active"]').first()
      .getAttribute('data-step')) === '4');

  // ------------------- still the same product -------------------
  check('the dark shell is still there', await page.locator('.bw-ls-top').isVisible());
  check('so is the mini-node strip', await page.locator('.bw-mini-item').count() === 5);
  check('and the way back to the journey', await page.locator('#bw-to-map').isVisible());
  check('stage 4 reads as current in the strip',
    await page.locator('.bw-mini-item[data-stage="4"]').getAttribute('data-state') === 'current',
    await page.locator('.bw-mini-item[data-stage="4"]').getAttribute('data-state'));
  check('the finished stages still carry their own stars',
    await page.locator('.bw-mini-item[data-state="completed"]').count() === 3);
  check('there is no second navigation system',
    await page.locator('.bw-spine').count() === 1 &&
    !(await page.locator('.bw-spine').isVisible()));

  // ------------------- the canvas stays pale -------------------
  check('the conversation canvas is light, not dark-themed', await page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.querySelector('.bw-chat-log'))
      .backgroundColor.match(/\d+/g).map(Number);
    return (r + g + b) / 3 > 200;
  }));

  // ------------------- the coach header -------------------
  check('the coach introduces itself',
    (await page.locator('.bw-coach-name').textContent()).includes('AI Workflow Coach'));
  check('with a face', await page.locator('.bw-coach-face img').count() === 1);
  check('and says what it is working on',
    (await page.locator('#bw-coach-chip').textContent()).includes('Refine'),
    await page.locator('#bw-coach-chip').textContent());
  check('the live/scripted badge moved up beside its name',
    await page.evaluate(() => document.querySelector('#bw-bot-badge')
      .closest('.bw-coach-who') !== null));

  // ------------------- the context rail -------------------
  check('the rail still names the stage',
    (await page.locator('#bw-ls-name').textContent()) === 'Refine');
  check('and narrows for the conversation', await page.evaluate(() => {
    const w = document.querySelector('.bw-ls-context').getBoundingClientRect().width;
    return w >= 170 && w <= 245;
  }), await page.evaluate(() =>
    Math.round(document.querySelector('.bw-ls-context').getBoundingClientRect().width)));
  check('it shows a current focus rather than a second lesson',
    await page.locator('#bw-chat-focus').isVisible() &&
    (await page.locator('#bw-focus-text').textContent()).length > 10);
  check('the lesson meta block steps aside',
    !(await page.locator('.bw-ls-meta').isVisible()));
  /* Refine's checklist is the four decisions it exists to settle, named before
     the conversation reaches them. */
  check('the within-stage checklist is there',
    await page.locator('.bw-focus-step').count() === 4,
    String(await page.locator('.bw-focus-step').count()));
  check('with exactly one step marked as now',
    await page.locator('.bw-focus-step[data-state="now"]').count() === 1);

  // ------------------- messages -------------------
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
    null, { timeout: 12000 });
  check('the coach opens the conversation', await page.locator('.bw-msg-bot').count() >= 1);
  await say(page, 'The drafting. Same four paragraphs with different names in them.', 2);
  check('the learner message is on the right, the coach on the left',
    await page.evaluate(() => {
      const mid = document.querySelector('.bw-chat-log').getBoundingClientRect().width / 2;
      const log = document.querySelector('.bw-chat-log').getBoundingClientRect().left;
      const u = document.querySelector('.bw-msg-user .bw-msg-body').getBoundingClientRect();
      const b = document.querySelector('.bw-msg-bot .bw-msg-body').getBoundingClientRect();
      return (u.right - log) > mid && (b.left - log) < mid;
    }));
  check('the two are plainly different surfaces', await page.evaluate(() => {
    const bg = s => getComputedStyle(document.querySelector(s + ' .bw-msg-body')).backgroundColor;
    return bg('.bw-msg-user') !== bg('.bw-msg-bot');
  }));
  check('neither runs the full width of the canvas', await page.evaluate(() => {
    const log = document.querySelector('.bw-chat-log').getBoundingClientRect().width;
    const u = document.querySelector('.bw-msg-user .bw-msg-body').getBoundingClientRect().width;
    const b = document.querySelector('.bw-msg-bot .bw-msg-body').getBoundingClientRect().width;
    return u < log * 0.95 && b < log * 0.95;
  }));
  check('the checklist noticed they have started',
    await page.locator('.bw-focus-step[data-state="done"]').count() >= 1);

  // ------------------- coaching cards -------------------
  check('the coach shows what it already has',
    await page.locator('[data-card="problem-summary"]').count() === 1);
  check('drawn from their real problem statement',
    (await page.locator('[data-card="problem-summary"]').textContent()).includes('eleven client'),
    await page.locator('[data-card="problem-summary"]').textContent());
  check('and their real mapped steps',
    (await page.locator('[data-card="specificity"] .bw-cc-item').allTextContents())
      .join('|').includes('Pull the delivery numbers'));
  check('cards are part of the conversation, not a dialog',
    await page.evaluate(() => document.querySelector('[data-card]').closest('#bw-chat-panel') !== null));

  // ------------------- the composer -------------------
  check('the composer is anchored under the conversation', await page.evaluate(() => {
    const log = document.querySelector('.bw-chat-log').getBoundingClientRect();
    const c = document.querySelector('.bw-chat-compose').getBoundingClientRect();
    return c.top >= log.bottom - 2;
  }));
  check('unsent text is not cleared by a re-render', async () => true);
  await page.fill('#bw-chat-input', 'half a thought');
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(200);
  check('a draft survives a re-render',
    (await page.locator('#bw-chat-input').inputValue()) === 'half a thought');
  await page.fill('#bw-chat-input', '');

  // ------------------- the handoff onward -------------------
  check('no handoff card before the coach has enough',
    await page.locator('[data-card="next-step"]').count() === 0);
  await say(page, 'Four short paragraphs, no bullets, under 200 words, direct tone.', 3);
  check('and none while a required decision is still open',
    await page.locator('[data-card="next-step"]').count() === 0,
    'rail: ' + await page.locator('.bw-focus-step').evaluateAll(
      els => els.map(e => e.dataset.state).join(',')));
  await say(page, 'The judgement about what to flag next week stays mine.', 4);
  await say(page, 'Never invent a number that is not in the export I paste.', 5);
  check('the handoff card appears once all four are settled',
    await page.locator('[data-card="next-step"]').count() === 1,
    'rail: ' + await page.locator('.bw-focus-step').evaluateAll(
      els => els.map(e => e.dataset.state).join(',')));
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(700);
  check('and it moves the learner on',
    await page.locator('.bw-step[data-step="5"]').getAttribute('data-state') === 'active');
  check('which lands on the next stage\'s content, not its chat',
    await page.locator('.bw-ls-work').isVisible());
  await ctx.close();

  // ------------------- resuming -------------------
  ({ ctx, page } = await openCoach());
  await page.click('[data-next="4"]');
  await page.waitForTimeout(800);
  await say(page, 'The drafting step, mostly.', 2);
  await page.click('#bw-to-map');
  await page.waitForTimeout(700);
  await page.click('.bw-station[data-stage="4"] .bw-station-card');
  await page.waitForTimeout(800);
  check('coming back mid-conversation resumes the conversation',
    await page.locator('#bw-chat-panel').isVisible());
  check('with the transcript intact', await page.locator('.bw-msg-user').count() === 1);
  await ctx.close();

  // ------------------- reduced motion -------------------
  ({ ctx, page } = await openCoach({ reducedMotion: 'reduce' }));
  await page.click('[data-next="4"]');
  await page.waitForTimeout(500);
  check('the handoff to the coach works with motion turned off',
    await page.locator('#bw-chat-panel').isVisible());
  await ctx.close();

  // ------------------- narrow -------------------
  ({ ctx, page } = await openCoach({ viewport: { width: 390, height: 900 } }));
  await page.click('[data-next="4"]');
  await page.waitForTimeout(800);
  check('the rail collapses to a compact stage summary above the chat',
    await page.evaluate(() => {
      const r = document.querySelector('.bw-ls-context').getBoundingClientRect();
      const c = document.querySelector('#bw-chat-panel').getBoundingClientRect();
      return c.top >= r.bottom - 2 && r.height < 215;
    }), await page.evaluate(() => JSON.stringify({
      railH: Math.round(document.querySelector('.bw-ls-context').getBoundingClientRect().height),
      railB: Math.round(document.querySelector('.bw-ls-context').getBoundingClientRect().bottom),
      chatT: Math.round(document.querySelector('#bw-chat-panel').getBoundingClientRect().top)
    })));
  check('the mini-node strip is still readable',
    await page.locator('.bw-mini-item').count() === 5 &&
    await page.evaluate(() =>
      document.querySelector('.bw-mini-list').getBoundingClientRect().height > 20));
  check('the composer is still usable', await page.locator('#bw-chat-input').isVisible());
  check('bubbles take more of the width on a phone', await page.evaluate(() => {
    const log = document.querySelector('.bw-chat-log').getBoundingClientRect().width;
    const b = document.querySelector('.bw-msg-bot .bw-msg-body').getBoundingClientRect().width;
    return b > log * 0.6;
  }));
  check('no horizontal page scrolling', await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
  await ctx.close();

  /* ---------- the coach header, across the widths it has to survive ----------

     The header's job is to say who the learner is talking to and to offer the
     one control that can undo the conversation. It used to give that width away
     to "04  Working on: Refine" - which the mini-node strip above it and the
     stage panel below it were both already saying - and the coach's name broke
     across three lines to make room. Restart, meanwhile, was display:none below
     720: not a layout compromise but a capability that disappeared at a screen
     size, because restarting Refine clears its four decisions and re-locks
     Deploy. */
  for (const width of [360, 390, 430, 768]) {
    ({ ctx, page } = await openCoach({ viewport: { width, height: 900 } }));
    await page.click('[data-next="4"]');
    await page.waitForTimeout(800);
    const h = await page.evaluate(() => {
      const box = s => { const el = document.querySelector(s); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right),
                 shown: getComputedStyle(el).display !== 'none' && r.width > 0 }; };
      return { name: box('.bw-coach-name'), chip: box('.bw-coach-chip'),
               restart: box('.bw-coach-restart'), head: box('.bw-coach-head'),
               overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    check(width + ': the coach name stays on one line', h.name.h < 30,
      JSON.stringify(h.name));
    check(width + ': Restart is reachable', h.restart && h.restart.shown,
      JSON.stringify(h.restart));
    check(width + ': nothing overlaps the way out',
      h.restart.r <= h.head.r + 1 && h.name.r <= h.restart.r,
      JSON.stringify({ name: h.name.r, restart: h.restart.r, head: h.head.r }));
    check(width + ': no horizontal overflow', h.overflow <= 1, String(h.overflow));
    /* Stage context is duplicated twice over on a phone; above 720 there is
       room for the compact form. */
    if (width <= 720) {
      check(width + ': the stage chip stands aside', !h.chip.shown, JSON.stringify(h.chip));
    } else {
      check(width + ': the compact stage chip is there', h.chip.shown, JSON.stringify(h.chip));
      check(width + ': and it is the short form, not the sentence',
        (await page.locator('#bw-coach-chip').textContent()).trim() === '04 Refine',
        await page.locator('#bw-coach-chip').textContent());
    }
    await ctx.close();
  }

  /* Reachable is not the same as working: the confirm is two presses, and the
     second one has to still do what it did at desktop width. */
  ({ ctx, page } = await openCoach({ viewport: { width: 390, height: 900 } }));
  await page.click('[data-next="4"]');
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
    null, { timeout: 12000 });
  await say(page, 'Steps 1 and 3, the drafting of each client update.', 2);
  check('a decision is settled before the restart',
    await page.locator('.bw-focus-step[data-state="done"]').count() === 1);
  await page.click('#bw-coach-restart');
  check('one press asks rather than acts',
    (await page.locator('#bw-coach-restart').textContent()).toLowerCase().includes('again'),
    await page.locator('#bw-coach-restart').textContent());
  await page.click('#bw-coach-restart');
  await page.waitForTimeout(900);
  check('and the second press clears the decision on a phone too',
    await page.locator('.bw-focus-step[data-state="done"]').count() === 0,
    String(await page.locator('.bw-focus-step[data-state="done"]').count()));
  await ctx.close();

  // ============ coming back to a stage with everything already filled ============
  /* Pinned context is meant to orient the conversation, not crowd it out. Once
     a learner has reached the master prompt, every card has something to say,
     and a rail that never yields leaves the transcript a two-line slot. */
  ({ ctx, page } = await openFinished(4));
  let g = await railVsLog(page);
  check('the rail never overlaps the transcript', g.overlap <= 0, JSON.stringify(g));
  check('and never takes more of the panel than the conversation',
    g.railH < g.logH, JSON.stringify(g));
  check('the rail is capped rather than sized by its contents',
    g.railH <= Math.round(g.panelH * 0.26) + 2, JSON.stringify(g));
  check('a long list scrolls inside its own card, so the card stays a glance',
    await page.evaluate(() => {
      const ul = document.querySelector('.bw-cc-specificity .bw-cc-items');
      return ul.clientHeight <= 110 && ul.scrollHeight > ul.clientHeight &&
             getComputedStyle(ul).overflowY === 'auto';
    }), await page.evaluate(() => {
      const ul = document.querySelector('.bw-cc-specificity .bw-cc-items');
      return JSON.stringify({ client: ul.clientHeight, scroll: ul.scrollHeight });
    }));
  check('the transcript is still usable', g.logH > 120, JSON.stringify(g));
  await ctx.close();

  /* Stage 1 is naming a task. The mapped steps are stage 2's output, and on the
     way back through they are someone else's work burying this conversation. */
  ({ ctx, page } = await openFinished(1));
  check('stage 1 shows what the coach took down here',
    await page.locator('[data-card="problem-summary"]').count() === 1);
  check("but not another stage's workflow steps",
    await page.locator('[data-card="specificity"]').count() === 0);
  g = await railVsLog(page);
  check('so the conversation keeps the room', g.logH > g.railH, JSON.stringify(g));
  await ctx.close();

  // ==================== stage 1: lesson, then its own coach ====================
  ({ ctx, page } = await openStage1());
  check('stage 1 opens on a lesson, not a chat',
    await page.locator('#bw-lesson-body').isVisible() &&
    !(await page.locator('#bw-chat-panel').isVisible()));
  check('the lesson is a heading and prose only',
    (await page.locator('#bw-lesson-copy').textContent()).trim().length > 80 &&
    await page.locator('.bw-ls-work svg').count() === 0 &&
    await page.locator('#bw-lesson-body input, #bw-lesson-body textarea').count() === 0);

  await page.click('#bw-lesson-next');
  await page.waitForTimeout(800);
  check('continue loads the coach on its own screen',
    await page.locator('#bw-chat-panel').isVisible() &&
    !(await page.locator('#bw-lesson-body').isVisible()));
  check('the explainer card belongs to the lesson; the coach gets the stage icon',
    !(await page.locator('#bw-ls-lesson-art').isVisible()) &&
    await page.locator('#bw-ls-art svg').isVisible());
  check('the rail says what this stage is for',
    (await page.locator('#bw-focus-text').textContent()).includes('hand off'),
    await page.locator('#bw-focus-text').textContent());
  check('and which stage it is',
    (await page.locator('#bw-coach-chip').textContent()).includes('Identify'),
    await page.locator('#bw-coach-chip').textContent());
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
    null, { timeout: 12000 });

  // The conversation is how the problem statement gets written.
  check('nothing written down before they speak',
    await page.locator('[data-card="problem-summary"]').count() === 0);
  await say(page, 'nope', 2);
  check('a non-answer is pushed back on, not banked',
    !(await page.locator('[data-action="save-and-continue"]').count()));
  await say(page,
    'Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.', 3);
  check('what the coach took down is shown back',
    (await page.locator('[data-card="problem-summary"]').textContent()).includes('eleven client'),
    await page.locator('[data-card="problem-summary"]').textContent());
  check('and the non-answer is not glued to the front of it',
    !(await page.locator('[data-card="problem-summary"]').textContent()).includes('nope'),
    await page.locator('[data-card="problem-summary"]').textContent());
  await say(page, 'They go out before nine, and the tone drifts by the eleventh one.', 4);
  check('the handoff appears once the coach has enough',
    await page.locator('[data-action="save-and-continue"]').isVisible());

  // Stage 1's transcript belongs to stage 1.
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(700);
  check('the handoff moves on to stage 2',
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '2',
    await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage'));
  check('stage 2 does not inherit stage 1\'s conversation',
    await page.locator('.bw-msg').count() === 0,
    'msgs=' + await page.locator('.bw-msg').count());
  await page.click('.bw-mini-item[data-stage="1"] .bw-mini-node');
  await page.waitForTimeout(700);
  check('and stage 1 picks its own back up mid-conversation',
    await page.locator('#bw-chat-panel').isVisible() &&
    await page.locator('.bw-msg').count() === 7,
    'msgs=' + await page.locator('.bw-msg').count());
  await ctx.close();
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
