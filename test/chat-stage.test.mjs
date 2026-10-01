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
async function openFinished(stage, width = 1000) {
  /* 1000 rather than a narrow width on purpose: the rail checks below are about the
     pinned context cards, which only sit over the transcript above 900px. Below it
     they are behind a disclosure (see "pinned context on a narrow screen"). */
  const ctx = await browser.newContext({ viewport: { width, height: 760 } });
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

  /* ---------- the ground between the two breakpoints ----------

     The header work added a 480 rule for the adapter badge, and the bubble cap
     that belonged to 720 went in with it - so 481-720 quietly lost it. The two
     rules answer different problems (a tablet-width column that reads too wide
     against a phone header that runs out of room), so 600 is where a drifting
     boundary shows: the cap has to be in force and the badge has to still be
     there. A computed 88% is the tablet rule winning; the base 70ch/62ch
     resolves to px, so the two are not confusable. */
  ({ ctx, page } = await openCoach({ viewport: { width: 600, height: 900 } }));
  await page.click('[data-next="4"]');
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
    null, { timeout: 12000 });
  await say(page, 'Steps 1 and 3, the drafting of each client update.', 2);
  const mid = await page.evaluate(() => {
    const cap = s => getComputedStyle(document.querySelector(s + ' .bw-msg-body')).maxWidth;
    const badge = document.querySelector('.bw-coach-name .bw-badge');
    const chip = document.querySelector('.bw-coach-chip');
    return { bot: cap('.bw-msg-bot'), user: cap('.bw-msg-user'),
             badge: badge ? getComputedStyle(badge).display : 'missing',
             chip: chip ? getComputedStyle(chip).display : 'missing' };
  });
  check('600: the coach bubble still takes the tablet cap', mid.bot === '88%',
    JSON.stringify(mid));
  check('600: and so does the learner bubble', mid.user === '88%', JSON.stringify(mid));
  check('600: the adapter badge is a phone concession, not a tablet one',
    mid.badge !== 'none' && mid.badge !== 'missing', JSON.stringify(mid));
  check('600: the stage chip is still the 720 rule\'s business',
    mid.chip === 'none', JSON.stringify(mid));
  await ctx.close();

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

  /* =================== respecting where the learner is reading ===================

     The transcript used to be pinned to the bottom unconditionally. The case
     that broke: send an answer, scroll up while the coach works to reread what
     you said, and the reply yanks you back down - 825px at desktop width, 1542
     on a phone, and twice a turn counting the typing indicator. In Refine the
     thing yanked away is the earlier decision you scrolled back to in order to
     answer the current one.

     Pin state is positional, so the whole contract is testable as geometry: who
     is allowed to move the learner, and what tells them a reply arrived when
     nobody is. */
  const scrollGeo = page => page.evaluate(() => {
    const l = document.querySelector('.bw-chat-log');
    const j = document.getElementById('bw-chat-jump');
    return {
      top: Math.round(l.scrollTop),
      fromBottom: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight),
      jump: !!j && !j.hidden
    };
  });
  const toTop = page => page.evaluate(() => { document.querySelector('.bw-chat-log').scrollTop = 0; });
  let sg;

  for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }],
                                   ['phone', { width: 390, height: 780 }]]) {
    ({ ctx, page } = await openCoach({ viewport }));
    await page.click('[data-next="4"]');
    await page.waitForTimeout(800);
    await page.waitForFunction(
      () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
      null, { timeout: 12000 });
    // Two turns, so there is more transcript than viewport to be moved around in.
    await say(page, 'Steps 1 and 3 - the pulling of numbers and the drafting of each client update, which is the part that eats the morning.', 2);
    await say(page, 'The judgement about what to flag for each client next week stays mine, and so does the final read before anything goes out.', 3);
    check(label + ': the transcript is long enough to have somewhere to scroll',
      await page.evaluate(() => { const l = document.querySelector('.bw-chat-log');
        return l.scrollHeight > l.clientHeight + 120; }),
      JSON.stringify(await scrollGeo(page)));

    /* A. Pinned. Nothing changes: the learner never left the bottom, so the
       conversation goes on following it and there is nothing to announce. */
    sg = await scrollGeo(page);
    check(label + ': a learner who stayed at the bottom is still at the bottom',
      sg.fromBottom === 0, JSON.stringify(sg));
    check(label + ': and is told nothing, because they saw it arrive', !sg.jump, JSON.stringify(sg));

    /* B. Unpinned mid-turn - the actual bug. Pin state has to be read when the
       reply lands, not when Send was pressed. */
    await page.fill('#bw-chat-input', 'Four short paragraphs, no bullets, under two hundred words, direct and plain.');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(90);        // the user message and the typing indicator are in
    await toTop(page);
    const parked = await scrollGeo(page);
    check(label + ': the typing indicator does not announce a reply that has not arrived',
      !parked.jump, JSON.stringify(parked));
    await page.waitForFunction(
      () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 4,
      null, { timeout: 15000 });
    await page.waitForTimeout(300);
    sg = await scrollGeo(page);
    check(label + ': the reply does not yank a learner who scrolled up to reread',
      sg.top === parked.top, JSON.stringify({ parked: parked.top, after: sg.top }));
    check(label + ': and it says so, because the reply landed out of sight',
      sg.jump, JSON.stringify(sg));

    /* C. The way back. */
    await page.click('#bw-chat-jump');
    await page.waitForTimeout(250);
    sg = await scrollGeo(page);
    check(label + ': the control goes to the newest turn', sg.fromBottom === 0, JSON.stringify(sg));
    check(label + ': and clears itself once there', !sg.jump, JSON.stringify(sg));
    /* Restoring the pin is the point: the next reply has to follow again. */
    await say(page, 'Never invent a number that is not in the export I paste in.', 5);
    await page.waitForTimeout(200);
    sg = await scrollGeo(page);
    check(label + ': the pin is restored, so the next reply follows',
      sg.fromBottom === 0 && !sg.jump, JSON.stringify(sg));

    /* B2. Just outside the tolerance, which is where the coach's own DOM change
       can decide the answer.

       Resolving a reply removes the typing indicator first, which shrinks the log
       by more than the tolerance is wide. The browser then clamps scrollTop to the
       new bottom - so a learner who was genuinely scrolled away can be handed a
       pinned position they never asked for, and the reply follows the bottom on
       the strength of the coach's own mutation. Sampling before the append is not
       enough; it has to be before any of it. */
    await page.fill('#bw-chat-input', 'And keep the same order of sections every week, so it reads the same.');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(90);
    const shrink = await page.evaluate(() => {
      const l = document.querySelector('.bw-chat-log');
      const t = l.querySelector('[data-typing]');
      const gap = parseFloat(getComputedStyle(l).rowGap || getComputedStyle(l).gap) || 0;
      return t ? Math.round(t.getBoundingClientRect().height + gap) : 0;
    });
    await page.evaluate(() => { const l = document.querySelector('.bw-chat-log');
      l.scrollTop = l.scrollHeight - l.clientHeight - 40; });
    const edge = await scrollGeo(page);
    check(label + ': parked outside the tolerance while the coach is working',
      edge.fromBottom > 32, JSON.stringify(edge));
    /* Without this the case is not being exercised at all: if losing the indicator
       no longer shrinks the log past where the learner is parked, nothing gets
       clamped and the check below passes for the wrong reason. */
    check(label + ': and near enough that losing the indicator would clamp them',
      shrink > edge.fromBottom, JSON.stringify({ shrink: shrink, fromBottom: edge.fromBottom }));
    await page.waitForFunction(
      () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 6,
      null, { timeout: 15000 });
    await page.waitForTimeout(300);
    sg = await scrollGeo(page);
    check(label + ': the indicator disappearing does not decide that they are pinned',
      sg.top === edge.top, JSON.stringify({ parked: edge.top, after: sg.top }));
    check(label + ': so the reply announces itself rather than following', sg.jump,
      JSON.stringify(sg));

    await ctx.close();
  }

  /* The learner's own Send, and the geometry it causes.

     Sending is one deliberate force-to-the-bottom, but it is also what makes the
     coach's context cards appear. On Identify the second answer brings the "Next
     step" card in above the composer, which shrinks the transcript viewport by
     88px on desktop and 120px on a phone. A shrinking viewport fires no scroll
     event, so a learner who never touched the scrollbar was suddenly 133-165px
     from the bottom, read as scrolled away, and the reply that was asking them to
     confirm a summary landed out of sight behind a "New reply" pill.

     Geometry caused by processing the Send is the learner's, not the coach's: it
     must not turn a deliberate Send into an unpinned state. Nothing here scrolls
     manually, because that is exactly the learner this is about. */
  for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }],
                                   ['phone', { width: 390, height: 780 }]]) {
    const ictx = await browser.newContext({ viewport });
    const ipage = await ictx.newPage();
    report.watch(ipage);
    await ipage.addInitScript(() => localStorage.setItem('bw_started', '1'));
    await ipage.goto(`http://127.0.0.1:${PORT}/`);
    await ipage.waitForTimeout(400);
    await ipage.click('.bw-station[data-stage="1"] .bw-station-card');
    await ipage.waitForTimeout(700);
    await ipage.click('#bw-lesson-next');
    await ipage.waitForFunction(
      () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
      null, { timeout: 12000 });
    await say(ipage, 'Every Monday I spend about two hours building status updates for eleven clients - pulling the same delivery numbers, writing the same four paragraphs, just with different names.', 2);
    const viewH = () => ipage.evaluate(() => Math.round(document.querySelector('.bw-chat-log').clientHeight));
    const beforeH = await viewH();
    await say(ipage, 'It happens every week, it has to be done before nine on Monday, and it eats my whole morning before I get to real client work.', 3);
    await ipage.waitForTimeout(300);
    const afterH = await viewH();
    check(label + ' (Identify): the Next step card arrived and took space from the transcript',
      await ipage.locator('#bw-cards-bottom .bw-cc').count() === 1 && beforeH - afterH > 32,
      JSON.stringify({ before: beforeH, after: afterH }));
    const fin = await ipage.evaluate(() => {
      const l = document.querySelector('.bw-chat-log'), lr = l.getBoundingClientRect();
      const bots = l.querySelectorAll('.bw-msg-bot:not([data-typing]) .bw-msg-body');
      const br = bots[bots.length - 1].getBoundingClientRect();
      const j = document.getElementById('bw-chat-jump');
      return { fromBottom: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight),
               jump: !!j && !j.hidden,
               replyBottomIn: br.bottom <= lr.bottom + 1,       // the end of the summary is on screen
               replyTopIn: br.top >= lr.top - 1,                // and so is the start of it
               replyH: Math.round(br.height), logH: Math.round(lr.height) };
    });
    check(label + ' (Identify): a learner who never scrolled is still at the newest turn',
      fin.fromBottom <= 32, JSON.stringify(fin));
    check(label + ' (Identify): so no "New reply" is raised for a reply they are looking at',
      !fin.jump, JSON.stringify(fin));
    check(label + ' (Identify): the summary they are asked to confirm ends in view',
      fin.replyBottomIn, JSON.stringify(fin));
    /* Interim assertion until the phone layout gave the transcript its height back
       was "ends in view", which let a learner see the confirm button without seeing
       what they were confirming. It starts in view too, at both widths now. */
    check(label + ' (Identify): and it begins in view, so all of what they confirm is on screen',
      fin.replyTopIn, JSON.stringify(fin));
    await ictx.close();
  }

  /* D and E on one transcript, at phone width where the yank was worst. */
  ({ ctx, page } = await openCoach({ viewport: { width: 390, height: 780 } }));
  await page.click('[data-next="4"]');
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
    null, { timeout: 12000 });
  await say(page, 'Steps 1 and 3 - the pulling of the numbers and the drafting of each update.', 2);
  await say(page, 'The judgement about what to flag next week stays mine, and the final read too.', 3);

  // D: scrolling back down by hand is the same thing as pressing the control.
  await page.fill('#bw-chat-input', 'Four short paragraphs, no bullets, under two hundred words.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(90);
  await toTop(page);
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 4,
    null, { timeout: 15000 });
  await page.waitForTimeout(250);
  check('a reply is waiting before the manual re-pin', (await scrollGeo(page)).jump);
  await page.evaluate(() => { const l = document.querySelector('.bw-chat-log'); l.scrollTop = l.scrollHeight; });
  await page.waitForTimeout(250);
  sg = await scrollGeo(page);
  check('scrolling back down by hand clears the control', !sg.jump, JSON.stringify(sg));
  check('and re-pins without a control to find', sg.fromBottom === 0, JSON.stringify(sg));
  /* Within the tolerance counts as the bottom. Fractional layout and browser zoom
     both leave a pixel or two behind, and at a threshold of zero that silently
     unpins someone who never scrolled.

     Read through the scroll listener rather than through an arriving reply: a
     reply is preceded by the typing indicator being REMOVED, which shrinks the
     log and re-clamps scrollTop to the bottom, so a learner parked just inside
     the tolerance gets there by the clamp whatever the threshold is. That path
     cannot tell a tolerance of 32 from one of 0. This one can. */
  await page.fill('#bw-chat-input', 'Never invent a number that is not in the export I paste in.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(90);
  await toTop(page);
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 5,
    null, { timeout: 15000 });
  await page.waitForTimeout(250);
  check('unpinned again, with a reply waiting', (await scrollGeo(page)).jump);
  await page.evaluate(() => { const l = document.querySelector('.bw-chat-log');
    l.scrollTop = l.scrollHeight - l.clientHeight - 20; });
  await page.waitForTimeout(200);
  sg = await scrollGeo(page);
  check('20px short of the bottom is inside the tolerance, not a near miss',
    sg.fromBottom > 10 && sg.fromBottom < 32, JSON.stringify(sg));
  check('so it counts as back at the bottom and clears the control',
    !sg.jump, JSON.stringify(sg));

  // E: the learner's own send is deliberate and always returns to the bottom.
  await page.fill('#bw-chat-input', 'One more thing about the tone of the updates.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(90);
  await toTop(page);
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 6,
    null, { timeout: 15000 });
  await page.waitForTimeout(250);
  check('set up unpinned with a reply waiting', (await scrollGeo(page)).jump);
  await page.fill('#bw-chat-input', 'And keep the same order of sections every week.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  sg = await scrollGeo(page);
  check('sending is deliberate, so it returns to the bottom', sg.fromBottom === 0, JSON.stringify(sg));
  check('and clears the control on the way', !sg.jump, JSON.stringify(sg));
  check('no horizontal overflow from the control', await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
  await ctx.close();

  /* A passive repaint must not move anyone either.

     `renderChatLog()` used to end in an unconditional jump to the bottom, so
     every caller inherited one whether or not the learner had done anything. The
     cross-block sync is the caller that matters: it fires on a sibling block's
     write, on a poll, on focus and on scrolling into view - none of which the
     learner asked for. Production never reaches it (blockRole "all" returns
     early from wireCrossBlockSync), which is exactly why it is worth a test: the
     split configuration should not keep the bug because the shipped one cannot
     see it. /role/coach-handoff is a split coach that owns step 4. */
  {
    const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const spage = await sctx.newPage();
    report.watch(spage);
    const turn = (role, text, at) => ({ role, text, at });
    await spage.addInitScript(seed => {
      localStorage.setItem('brainstorm_workflow_data', seed);
      localStorage.setItem('bw_started', '1');
    }, JSON.stringify({
      ...SEED,
      conversations: { handoff: [
        turn('bot', 'Looking at the steps you mapped, which parts should AI take on?', '9:00 AM'),
        turn('user', 'The drafting of each client update, and the first pass at the numbers.', '9:01 AM'),
        turn('bot', 'Good. That is the part that repeats, and repetition is what it is for.', '9:01 AM'),
        turn('user', 'The judgement about what to flag for each client next week stays mine.', '9:02 AM'),
        turn('bot', 'Noted - the call stays with you and the assembly does not.', '9:02 AM'),
        turn('user', 'Four short paragraphs, no bullets, under two hundred words, direct.', '9:03 AM'),
        turn('bot', 'That is a bar you can hold a draft against.', '9:03 AM')
      ] },
      progress: { unlocked: 4, current: 4, done: { 1: true, 2: true, 3: true },
                  entered: { 1: true, 2: true, 3: true } }
    }));
    await spage.goto(`http://127.0.0.1:${PORT}/role/coach-handoff`);
    await spage.waitForTimeout(600);
    check('the split coach has a transcript that scrolls', await spage.evaluate(() => {
      const l = document.querySelector('.bw-chat-log');
      return !!l && l.scrollHeight > l.clientHeight + 60;
    }));
    await spage.evaluate(() => { document.querySelector('.bw-chat-log').scrollTop = 0; });
    await spage.waitForTimeout(120);
    const before = await scrollGeo(spage);
    // A sibling block writes something real, then tells this one about it.
    await spage.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('brainstorm_workflow_data'));
      d.problem = 'A problem statement rewritten in the block above this one.';
      const raw = JSON.stringify(d);
      localStorage.setItem('brainstorm_workflow_data', raw);
      window.dispatchEvent(new StorageEvent('storage',
        { key: 'brainstorm_workflow_data', newValue: raw, storageArea: localStorage }));
    });
    await spage.waitForTimeout(500);
    const after = await scrollGeo(spage);
    check('a sibling block catching up does not move the learner',
      after.top === before.top, JSON.stringify({ before: before.top, after: after.top }));
    check('and does not claim a reply arrived, because none did', !after.jump,
      JSON.stringify(after));

    /* The same sync during a turn in flight.

       The typing indicator is not part of the conversation, so a repaint rebuilt
       from the conversation deletes it - as collateral, for a sibling's write to
       something this block does not even own. That is the coach's transient UI
       being removed by a passive path, and it moves the learner the same way
       removing it on a reply does: the log shrinks past someone parked just
       outside the tolerance and scrollTop clamps to the new bottom, so by the time
       the reply samples the pin they read as pinned without having chosen to be.
       Checked on the indicator itself first, because that is the direct proof. */
    await spage.evaluate(() => { const l = document.querySelector('.bw-chat-log');
      l.scrollTop = l.scrollHeight; });
    await spage.fill('#bw-chat-input', 'Keep the same order of sections every week so it reads the same.');
    await spage.keyboard.press('Enter');
    await spage.waitForSelector('.bw-chat-log [data-typing]', { timeout: 3000 });
    await spage.evaluate(() => { const l = document.querySelector('.bw-chat-log');
      l.scrollTop = l.scrollHeight - l.clientHeight - 40; });
    const inflight = await scrollGeo(spage);
    check('a turn is in flight with the learner just outside the tolerance',
      inflight.fromBottom > 32 && await spage.locator('.bw-chat-log [data-typing]').count() === 1,
      JSON.stringify(inflight));
    await spage.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('brainstorm_workflow_data'));
      d.problem = 'Rewritten again in the block above, while this coach is still answering.';
      const raw = JSON.stringify(d);
      localStorage.setItem('brainstorm_workflow_data', raw);
      window.dispatchEvent(new StorageEvent('storage',
        { key: 'brainstorm_workflow_data', newValue: raw, storageArea: localStorage }));
    });
    await spage.waitForTimeout(250);
    const synced = await scrollGeo(spage);
    check('a sibling write does not delete the typing indicator mid-turn',
      await spage.locator('.bw-chat-log [data-typing]').count() === 1,
      JSON.stringify({ typing: await spage.locator('.bw-chat-log [data-typing]').count() }));
    check('and does not move the learner while it waits',
      synced.top === inflight.top, JSON.stringify({ parked: inflight.top, after: synced.top }));
    await spage.waitForFunction(
      () => !document.querySelector('.bw-chat-log [data-typing]'), null, { timeout: 15000 });
    await spage.waitForTimeout(300);
    const landed = await scrollGeo(spage);
    check('the reply that follows does not inherit a pin the learner never chose',
      landed.top === inflight.top, JSON.stringify({ parked: inflight.top, after: landed.top }));
    check('and announces itself', landed.jump, JSON.stringify(landed));
    await sctx.close();
  }

  /* The control is a control, not a second announcement. #bw-chat-log is a
     polite live region that already reads the incoming reply out; a live control
     describing the same event would announce it twice. */
  ({ ctx, page } = await openCoach({ viewport: { width: 1280, height: 900 } }));
  await page.click('[data-next="4"]');
  await page.waitForTimeout(800);
  const a11y = await page.evaluate(() => {
    const j = document.getElementById('bw-chat-jump');
    return { inLog: !!document.querySelector('#bw-chat-log #bw-chat-jump'),
             live: j.getAttribute('aria-live'), role: j.getAttribute('role'),
             tag: j.tagName, label: j.getAttribute('aria-label'),
             logLive: document.getElementById('bw-chat-log').getAttribute('aria-live') };
  });
  check('the control sits outside the transcript live region', !a11y.inLog, JSON.stringify(a11y));
  check('and carries no live behaviour of its own',
    !a11y.live && a11y.role !== 'status' && a11y.role !== 'alert', JSON.stringify(a11y));
  check('the transcript is still what announces the reply', a11y.logLive === 'polite',
    JSON.stringify(a11y));
  check('it is an ordinary labelled button',
    a11y.tag === 'BUTTON' && /newest/i.test(a11y.label), JSON.stringify(a11y));
  /* Hiding a focused button would drop the tab position onto the body, and
     focusing the composer instead would raise a phone keyboard for someone who
     only wanted to read. */
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
    null, { timeout: 12000 });
  await say(page, 'Steps 1 and 3, the drafting of each client update and the numbers behind it.', 2);
  await page.fill('#bw-chat-input', 'The judgement about what to flag next week stays mine.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(90);
  await toTop(page);
  await page.waitForFunction(
    () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 3,
    null, { timeout: 15000 });
  await page.waitForTimeout(250);
  await page.focus('#bw-chat-jump');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const landed = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
  check('focus lands on the transcript, not the body', landed === 'bw-chat-log', landed);
  check('and not on the composer, which would open a phone keyboard',
    landed !== 'bw-chat-input', landed);
  await ctx.close();

  /* ============ pinned context, on a narrow screen ============

     On a phone the context cards took most of the transcript's canvas: 137-277px
     of a 593px panel at 390x780, against replies 282-421px tall, so no reply
     began in view. On a tablet the capped rail showed its second card as a title
     and nothing else. Below 900px they are now one disclosure, collapsed by
     default, over the SAME cards. Above 900px nothing about them has changed. */
  const SEED4 = {
    ...SEED,
    steps: [{ action: "Pull last week's delivery numbers", tools: 'Tableau' },
            { action: 'Check the shared inbox for anything unresolved', tools: 'Gmail' },
            { action: 'Draft a four paragraph update for each client', tools: 'Word' },
            { action: "Send each update in the client's preferred channel", tools: 'Gmail, Slack' }],
    toolsAll: ['Tableau', 'Gmail', 'Word', 'Slack'],
    idealOutcome: 'All eleven client updates are drafted and ready to review before nine on Monday, so my morning goes to client work instead of rebuilding decks.',
    aiRole: 'Pull the numbers and assemble a first draft of each update in our usual four-paragraph shape, so I am reviewing and adjusting rather than retyping.'
  };
  async function openRefine(viewport) {
    const rctx = await browser.newContext({ viewport });
    const rpage = await rctx.newPage();
    report.watch(rpage);
    await rpage.addInitScript(seed => {
      localStorage.setItem('brainstorm_workflow_data', seed);
      localStorage.setItem('bw_started', '1');
    }, JSON.stringify({ ...SEED4, progress: { unlocked: 4, current: 4, done: { 1: true, 2: true, 3: true },
                                            entered: { 1: true, 2: true, 3: true } } }));
    await rpage.goto(`http://127.0.0.1:${PORT}/`);
    await rpage.waitForTimeout(400);
    await rpage.click('.bw-station[data-stage="4"] .bw-station-card');
    await rpage.waitForTimeout(700);
    await rpage.click('[data-next="4"]');
    await rpage.waitForFunction(
      () => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1,
      null, { timeout: 12000 });
    await rpage.waitForTimeout(300);
    return { rctx, rpage };
  }
  const ctxState = page_ => page_.evaluate(() => {
    const t = document.getElementById('bw-ctx-toggle'), r = document.getElementById('bw-cards-top');
    const vis = e => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
    const rr = r.getBoundingClientRect();
    const cards = [...r.querySelectorAll('.bw-cc')].map(c => { const cr = c.getBoundingClientRect();
      return { title: c.querySelector('.bw-cc-title').textContent,
               clipped: Math.round(Math.max(0, cr.bottom - rr.bottom)) }; });
    const l = document.querySelector('.bw-chat-log').getBoundingClientRect();
    return { strip: vis(t), expanded: t.getAttribute('aria-expanded'), controls: t.getAttribute('aria-controls'),
             stripH: Math.round(t.getBoundingClientRect().height), sum: (t.querySelector('.bw-ctx-sum')||{}).textContent,
             rail: vis(r), cards, logH: Math.round(l.height),
             railOverlapsLog: vis(r) ? Math.round(rr.bottom - l.top) : 0 };
  });

  for (const width of [390, 430, 768, 900]) {
    const { rctx, rpage } = await openRefine({ width, height: width >= 768 ? 1024 : 780 });
    let c = await ctxState(rpage);
    check(width + ': pinned context is one disclosure strip', c.strip, JSON.stringify(c));
    check(width + ': collapsed by default, so the conversation owns the screen',
      c.expanded === 'false' && !c.rail, JSON.stringify(c));
    check(width + ': it names what is loaded, from the same cards',
      /Task/.test(c.sum) && /4 mapped steps/.test(c.sum), JSON.stringify(c.sum));
    check(width + ': and is a real tap target', c.stripH >= 44, JSON.stringify(c));
    check(width + ': pointing at the rail it controls', c.controls === 'bw-cards-top', JSON.stringify(c));
    const collapsedH = c.logH;
    await rpage.click('#bw-ctx-toggle');
    await rpage.waitForTimeout(150);
    c = await ctxState(rpage);
    check(width + ': opening it shows the context', c.expanded === 'true' && c.rail, JSON.stringify(c));
    check(width + ': both cards, whole - none cut off to a title',
      c.cards.length === 2 && c.cards.every(k => k.clipped === 0), JSON.stringify(c.cards));
    /* Whole means the list too: on a phone the steps wrap to two lines, and the list's
       own 104px cap used to scroll the fourth one away inside its card with nothing
       to say so. */
    check(width + ': and every mapped step is readable, not scrolled away inside its card',
      await rpage.evaluate(() => { const ul = document.querySelector('.bw-cc-specificity .bw-cc-items');
        return ul.scrollHeight <= ul.clientHeight + 1; }),
      await rpage.evaluate(() => { const ul = document.querySelector('.bw-cc-specificity .bw-cc-items');
        return JSON.stringify({ client: ul.clientHeight, scroll: ul.scrollHeight }); }));
    check(width + ': without overlapping the transcript', c.railOverlapsLog <= 0, JSON.stringify(c));
    check(width + ': the transcript yields room while it is open', c.logH < collapsedH,
      JSON.stringify({ open: c.logH, collapsed: collapsedH }));
    await rpage.click('#bw-ctx-toggle');
    await rpage.waitForTimeout(150);
    c = await ctxState(rpage);
    check(width + ': closing it gives the room back', !c.rail && Math.abs(c.logH - collapsedH) <= 2,
      JSON.stringify({ closed: c.logH, collapsed: collapsedH }));
    check(width + ': Restart is still reachable', await rpage.locator('#bw-coach-restart').isVisible());
    check(width + ': no horizontal overflow', await rpage.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
    await rctx.close();
  }
  {
    // Above 900 nothing changed: no strip, the cards where they have always been.
    for (const width of [901, 1280]) {
      const { rctx, rpage } = await openRefine({ width, height: 900 });
      const c = await ctxState(rpage);
      check(width + ': no disclosure strip above 900px', !c.strip, JSON.stringify(c));
      check(width + ': the pinned cards are in place', c.rail && c.cards.length === 2, JSON.stringify(c));
      await rctx.close();
    }
  }

  /* Opening or closing it moves the transcript's edge without a scroll event, and a
     learner who was following the conversation must not read as having left it. */
  {
    const { rctx, rpage } = await openRefine({ width: 390, height: 780 });
    await say(rpage, 'The first draft of each update and the pulling of the numbers, and I review the result.', 2);
    await rpage.click('#bw-ctx-toggle'); await rpage.waitForTimeout(150);
    await rpage.click('#bw-ctx-toggle'); await rpage.waitForTimeout(150);
    sg = await scrollGeo(rpage);
    check('opening and closing context does not move someone who was following',
      sg.fromBottom <= 32 && !sg.jump, JSON.stringify(sg));
    await rctx.close();
  }

  /* THE acceptance rule. A reply that arrives while the learner is following the
     conversation has to begin in view. Not "the log is some height": a 280px log
     with a 400px reply pinned to its bottom still starts above the fold, which is
     the failure this exists to prevent. Measured on the real scripted Refine
     replies, opening to the last decision, with the Next step card present at the
     end - the heaviest chrome the conversation ever carries. */
  const REFINE_ANSWERS = [
    'The first draft of each update and the pulling of the numbers. I want AI to assemble the routine parts, and I review the result.',
    'The call on what to flag to each client next week stays mine, and so does anything that changes what we promised them.',
    'Four short paragraphs, no bullets, under two hundred words, a direct tone, and the same shape every week.',
    'Never invent a number that is not in the export I paste in. Client names come from the CRM, never from memory.'];
  const replyView = page_ => page_.evaluate(() => {
    const l = document.querySelector('.bw-chat-log'), lr = l.getBoundingClientRect();
    const bots = l.querySelectorAll('.bw-msg-bot:not([data-typing]) .bw-msg-body');
    const br = bots[bots.length - 1].getBoundingClientRect();
    return { startsInView: br.top >= lr.top - 1, hiddenAbove: Math.max(0, Math.round(lr.top - br.top)),
             replyH: Math.round(br.height), logH: Math.round(lr.height),
             fromBottom: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight) };
  });
  for (const [label, viewport] of [['390x780', { width: 390, height: 780 }],
                                   ['430x780', { width: 430, height: 780 }],
                                   ['390x844', { width: 390, height: 844 }],
                                   ['768x1024', { width: 768, height: 1024 }],
                                   ['900x1024', { width: 900, height: 1024 }],
                                   ['1280x900', { width: 1280, height: 900 }]]) {
    const { rctx, rpage } = await openRefine(viewport);
    let v = await replyView(rpage);
    check(label + ': the opening begins in view', v.startsInView, JSON.stringify(v));
    for (let i = 0; i < REFINE_ANSWERS.length; i++) {
      await say(rpage, REFINE_ANSWERS[i], i + 2);
      await rpage.waitForTimeout(250);
      v = await replyView(rpage);
      check(label + ': reply ' + (i + 1) + (i === 3 ? ' (Next step card showing)' : '') + ' begins in view',
        v.startsInView && v.fromBottom <= 32, JSON.stringify(v));
    }
    check(label + ': the Next step card is what the last turn carried',
      await rpage.locator('#bw-cards-bottom .bw-cc-next-step').count() === 1);
    await rctx.close();
  }

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
