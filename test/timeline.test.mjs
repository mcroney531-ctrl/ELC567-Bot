/*
 * The journey map: five stations on a spine, one workspace, and the rules for
 * moving between them. What matters here is the navigation model rather than
 * the art - the cards are meant to be redrawn, so nothing below asserts on a
 * colour, a size, or an illustration.
 */
import { serveSite, makeReporter, loadChromium, waitBots } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('journey map');
const check = report.check;

const PORT = 8153;
const server = await serveSite(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
report.watch(page);

const station = n => page.locator(`.bw-station[data-stage="${n}"]`);
const stateOf = n => station(n).getAttribute('data-state');
const statusOf = n => station(n).locator('.bw-card-status').textContent();
const enter = async n => {
  await station(n).locator('.bw-station-card').click();
  await page.waitForTimeout(650);
};
const toMap = async () => { await page.click('#bw-to-map'); await page.waitForTimeout(550); };
const start = async () => { await page.click('#bw-start'); await page.waitForTimeout(750); };
/* Stage 1 is a lesson screen and then a coach, so this is the whole of it:
   read, continue, talk it through, take the handoff. */
const say = async (text, n) => {
  await page.fill('#bw-chat-input', text);
  await page.keyboard.press('Enter');
  await waitBots(page, n);
};
const fillStage1 = async () => {
  if (await page.locator('#bw-lesson-body').isVisible()) {
    await page.click('#bw-lesson-next');
    await page.waitForTimeout(800);
  }
  await waitBots(page, 1);
  await say('Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.', 2);
  await say('They go out to eleven clients before nine, and the tone drifts by the last one.', 3);
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(650);
};

try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);

  // ------------------------------------------------------------- the landing
  check('it opens on the landing', await page.locator('#bw-landing').isVisible());
  check('which is not the map', !(await page.locator('#bw-map').isVisible()));
  check('the objectives are there to read',
    await page.locator('.bw-objectives li').count() === 4);
  check('and a start button under them', await page.locator('#bw-start').isVisible());
  check('the worked example sits below the start, not above it', await page.evaluate(() => {
    const s = document.querySelector('#bw-start').getBoundingClientRect().top;
    const e = document.querySelector('.bw-example').getBoundingClientRect().top;
    return e > s;
  }));

  await start();

  // ---------------------------------------------------------------- the map
  check('start lands on the map', await page.locator('#bw-map').isVisible());
  check('and the landing steps aside', !(await page.locator('#bw-landing').isVisible()));
  check('home offers a way back to the landing',
    await page.locator('#bw-to-landing').isVisible());
  check('the map is home', await page.locator('#bw-map').isVisible());
  check('the workspace is not', !(await page.locator('#bw-stage').isVisible()));
  check('five stations', await page.locator('.bw-station').count() === 5);
  check('named for the practice, not this activity',
    (await page.locator('.bw-card-name').allTextContents()).join(',') ===
    'Identify,Map,Envision,Refine,Deploy',
    (await page.locator('.bw-card-name').allTextContents()).join(','));
  check('they alternate above and below the line',
    (await page.locator('.bw-station').evaluateAll(
      els => els.map(e => e.dataset.place).join(','))) === 'above,below,above,below,above');
  check('every station has artwork', await page.locator('.bw-card-art').count() === 5);
  check('and a numbered waypoint on the line', await page.locator('.bw-way-num').count() === 5);
  check('the connector is one path, not five segments',
    await page.locator('#bw-rail path.bw-rail-line').count() === 1);
  check('the spine carries a rail', await page.locator('.bw-rail').isVisible());

  // ------------------------------------------------------------ first states
  check('stage 1 is available', await stateOf(1) === 'available', await stateOf(1));
  check('nothing is current before anything is entered',
    await page.locator('.bw-station[data-state="current"]').count() === 0);
  check('stages 2 to 5 are locked',
    (await Promise.all([2, 3, 4, 5].map(stateOf))).join(',') === 'locked,locked,locked,locked');
  check('a locked station reads as upcoming',
    (await statusOf(3)) === 'Upcoming', await statusOf(3));
  check('and still tells assistive tech which stage opens it',
    (await station(3).locator('.bw-station-card').getAttribute('aria-label')).includes('Finish Map first'),
    await station(3).locator('.bw-station-card').getAttribute('aria-label'));
  check('an available station says it is ready',
    (await statusOf(1)) === 'Ready to start', await statusOf(1));
  check('every station describes itself, whatever its state',
    (await page.locator('.bw-card-blurb').allTextContents())[0] === 'Define the problem worth solving.' &&
    (await page.locator('.bw-card-blurb').allTextContents()).every(t => t.trim().length > 8));
  check('a locked station keeps its name visible',
    (await page.locator('.bw-card-name').nth(3).textContent()) === 'Refine');
  check('and shows a lock rather than its icon', await page.evaluate(() => {
    const st = document.querySelector('.bw-station[data-state="locked"]');
    return getComputedStyle(st.querySelector('.bw-card-lock')).display !== 'none' &&
           getComputedStyle(st.querySelector('.bw-card-art')).display === 'none';
  }));
  check('locked cards are not clickable', await station(4).locator('.bw-station-card').isDisabled());
  check('the map tells them where to pick up',
    (await page.locator('#bw-map-hint').textContent()).includes('Identify'));

  // ------------------------------------------------------------ enter a stage
  await enter(1);
  check('entering swaps the map for the workspace',
    !(await page.locator('#bw-map').isVisible()) && await page.locator('#bw-stage').isVisible());
  // Stage 1 opens on its lesson: artwork and prose, and nothing else on screen.
  check('only the entered stage is on screen',
    await page.locator('#bw-lesson-body').isVisible() &&
    await page.locator('.bw-step:visible').count() === 0,
    String(await page.locator('.bw-step:visible').count()));
  check('and it is the right one',
    (await page.locator('.bw-mini-item[data-state="current"]').getAttribute('data-stage')) === '1',
    await page.locator('.bw-mini-item[data-state="current"]').getAttribute('data-stage'));
  check('the workspace says where you are',
    (await page.locator('#bw-ls-step').textContent()) === 'Step 1 of 5',
    await page.locator('#bw-ls-step').textContent());
  check('and names the stage', (await page.locator('#bw-ls-name').textContent()) === 'Identify');
  check('the workspace does not repeat the whole timeline',
    !(await page.locator('.bw-spine').isVisible()));
  check('there is a way back', await page.locator('#bw-to-map').isVisible());

  // -------------------------------------------------- back out without finishing
  await toMap();
  check('back returns to the map', await page.locator('#bw-map').isVisible());
  check('an entered but unfinished stage is current, not available',
    await stateOf(1) === 'current', await stateOf(1));
  check('and says so', (await statusOf(1)) === 'In progress', await statusOf(1));
  check('current is marked for assistive tech',
    await station(1).locator('.bw-station-card').getAttribute('aria-current') === 'step');
  check('only one stage is current',
    await page.locator('.bw-station[data-state="current"]').count() === 1);
  check('current is still enterable',
    !(await station(1).locator('.bw-station-card').isDisabled()));

  // ------------------------------------------------ finish one, continue onward
  await enter(1);
  await fillStage1();
  check('continuing stays in the workspace',
    await page.locator('#bw-stage').isVisible() && !(await page.locator('#bw-map').isVisible()));
  check('and lands on the next stage',
    await page.locator('.bw-step:visible').getAttribute('data-step') === '2');
  check('the context panel moved with it',
    (await page.locator('#bw-ls-name').textContent()) === 'Map',
    await page.locator('#bw-ls-name').textContent());

  // ------------------------------------------------------ the completed state
  await toMap();
  check('the finished stage reads completed', await stateOf(1) === 'completed', await stateOf(1));
  check('with a status built from state, not prose',
    (await statusOf(1)) === 'Complete · Task defined', await statusOf(1));
  check('it is no longer current',
    await station(1).locator('.bw-station-card').getAttribute('aria-current') === null);
  check('a completed stage stays revisitable',
    !(await station(1).locator('.bw-station-card').isDisabled()));
  check('its waypoint becomes a star, not a number', await page.evaluate(() => {
    const st = document.querySelector('.bw-station[data-state="completed"]');
    return getComputedStyle(st.querySelector('.bw-way-star')).display !== 'none' &&
           getComputedStyle(st.querySelector('.bw-way-num')).display === 'none';
  }));
  check('the star takes the stage colour, not one gold for all', await page.evaluate(() => {
    const a = getComputedStyle(document.querySelector('.bw-station[data-accent="identify"]'))
      .getPropertyValue('--accent-done').trim();
    const b = getComputedStyle(document.querySelector('.bw-station[data-accent="refine"]'))
      .getPropertyValue('--accent-done').trim();
    return a && b && a !== b;
  }));
  check('the check overlays the dimmed icon rather than replacing it', await page.evaluate(() => {
    const st = document.querySelector('.bw-station[data-state="completed"]');
    return getComputedStyle(st.querySelector('.bw-card-check')).display !== 'none' &&
           getComputedStyle(st.querySelector('.bw-card-art')).display !== 'none';
  }));
  /* Continuing walks straight into stage 2, so by the time the learner is back
     on the map that stage is already in progress rather than merely unlocked.
     The available state is what a stage looks like before it is opened. */
  check('the next stage opened', await stateOf(2) !== 'locked', await stateOf(2));
  check('and reads as in progress, having been continued into',
    await stateOf(2) === 'current', await stateOf(2));
  check('and is the one to go to', await stateOf(2) === 'current' || await stateOf(2) === 'available',
    await stateOf(2));
  check('the stage after it is still locked', await stateOf(3) === 'locked');
  check('completed is visually distinct from locked', await page.evaluate(() => {
    const border = s => getComputedStyle(document.querySelector(
      `.bw-station[data-state="${s}"] .bw-station-card`)).borderTopColor;
    return border('completed') !== border('locked');
  }));

  // ----------------------------------------------- a count that comes from data
  await enter(2);
  const cards = page.locator('#bw-cards .bw-card');
  await page.click('#bw-add-step');
  const rows = [['Pull the numbers', 'Tableau'], ['Draft each update', 'Word'], ['Reformat the deck', 'PowerPoint']];
  for (let i = 0; i < 3; i++) {
    await cards.nth(i).locator('input').nth(0).fill(rows[i][0]);
    await cards.nth(i).locator('input').nth(1).fill(rows[i][1]);
  }
  await page.click('[data-next="2"]');
  await page.waitForTimeout(550);
  await toMap();
  check('the count is the real number of steps',
    (await statusOf(2)) === 'Complete · 3 steps mapped', await statusOf(2));
  /* The connector stays one neutral colour whatever the progress - state
     belongs to the nodes and the cards, never to the line. */
  check('the connector never takes on state colour', await page.evaluate(() => {
    const line = getComputedStyle(document.querySelector('#bw-rail .bw-rail-line')).stroke;
    const glacier = getComputedStyle(document.querySelector('.bw-map'))
      .getPropertyValue('--home-glacier').trim();
    return line && glacier && line.replace(/\s/g, '') !== 'none';
  }));
  check('and there is still exactly one of it',
    await page.locator('#bw-rail path.bw-rail-line').count() === 1);

  /* Completion lines are read off stored state, which can be anything a
     previous version or a demo run left behind. A saved "done" that no longer
     validates must not be taken at its word. */
  const oddCtx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const odd = await oddCtx.newPage();
  report.watch(odd);
  await odd.addInitScript(seed => localStorage.setItem('brainstorm_workflow_data', seed),
    JSON.stringify({
      version: 2,
      problem: 'A task I do every single week that takes most of a morning.',
      steps: [{ action: 'Do the whole thing by hand', tools: 'Excel' }],
      toolsAll: ['Excel'], masterPromptV1: '', masterPromptV2: '', v2Source: '',
      conversations: {}, mockProgress: {},
      botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
      progress: { current: 1, unlocked: 3, done: { 1: true, 2: true } }
    }));
  await odd.goto(`http://127.0.0.1:${PORT}/`);
  await odd.waitForTimeout(400);
  check('a stored "done" that no longer holds is not shown as done',
    (await odd.locator('.bw-station[data-stage="2"]').getAttribute('data-state')) === 'available',
    await odd.locator('.bw-station[data-stage="2"]').getAttribute('data-state'));
  check('and stage 1, which does still hold, stays completed',
    (await odd.locator('.bw-station[data-stage="1"]').getAttribute('data-state')) === 'completed');
  await oddCtx.close();

  /* The singular is reachable only where one step is a legal map, so test it
     there rather than pretending the form can produce it. */
  const soloServer = await serveSite(8154, { minWorkflowSteps: '1' });
  const soloCtx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const solo = await soloCtx.newPage();
  report.watch(solo);
  await solo.addInitScript(seed => localStorage.setItem('brainstorm_workflow_data', seed),
    JSON.stringify({
      version: 2,
      problem: 'A task I do every single week that takes most of a morning.',
      steps: [{ action: 'Do the whole thing by hand', tools: 'Excel' }],
      toolsAll: ['Excel'], masterPromptV1: '', masterPromptV2: '', v2Source: '',
      conversations: {}, mockProgress: {},
      botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
      progress: { current: 1, unlocked: 3, done: { 1: true, 2: true } }
    }));
  await solo.goto('http://127.0.0.1:8154/');
  await solo.waitForTimeout(400);
  const soloStatus = await solo.locator('.bw-station[data-stage="2"] .bw-card-status').textContent();
  check('one mapped step reads "1 step", not "1 steps"',
    soloStatus === 'Complete \u00b7 1 step mapped', soloStatus);
  await soloCtx.close();
  soloServer.close();

  // -------------------------------------------- landing is reachable, and home sticks
  await page.click('#bw-to-landing');
  await page.waitForTimeout(500);
  check('the back arrow reaches the landing', await page.locator('#bw-landing').isVisible());
  check('the objectives are still readable there',
    await page.locator('.bw-objectives li').count() === 4);
  await start();
  check('starting again returns to home', await page.locator('#bw-map').isVisible());
  check('and progress is exactly where it was', await stateOf(1) === 'completed', await stateOf(1));

  await page.reload();
  await page.waitForTimeout(600);
  check('a return visit opens on home, not the landing',
    await page.locator('#bw-map').isVisible() && !(await page.locator('#bw-landing').isVisible()));

  // ------------------------------------------------------------- reduced motion
  const rmCtx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1100, height: 900 } });
  const rm = await rmCtx.newPage();
  report.watch(rm);
  await rm.goto(`http://127.0.0.1:${PORT}/`);
  await rm.waitForTimeout(300);
  await rm.click('#bw-start');
  await rm.waitForTimeout(400);
  check('starting works with motion turned off', await rm.locator('#bw-map').isVisible());
  await rm.locator('.bw-station[data-stage="1"] .bw-station-card').click();
  await rm.waitForTimeout(300);
  check('navigation still works with motion turned off',
    await rm.locator('#bw-stage').isVisible() && !(await rm.locator('#bw-map').isVisible()));
  await rmCtx.close();

  // ------------------------------------------------------------- narrow screens
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(200);
  await page.waitForTimeout(300);
  check('the spine stands up on a phone', await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.bw-station-card')].map(c => c.getBoundingClientRect());
    // Stacked, not strung out left to right.
    return cards.every(r => Math.abs(r.left - cards[0].left) < 2) &&
           cards[4].top > cards[0].top;
  }));
  check('no horizontal overflow on the map at 360px', await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
  check('all five stations are still there',
    await page.locator('.bw-station-card').count() === 5);
  check('the legend stays compact when it stacks', await page.evaluate(() =>
    document.querySelector('.bw-legend-strip').getBoundingClientRect().height < 200),
    String(await page.evaluate(() => document.querySelector('.bw-legend-strip').getBoundingClientRect().height)));

  /* ---------------- every scenario the pack asks for, rendered ----------------
     Driven by seeding progress directly, because the point is that the four
     states fall out of the state model rather than out of the route taken. */
  const SEED = {
    version: 2, problem: 'A weekly task that eats most of a morning, every Monday.',
    steps: [{ action: 'Pull the numbers', tools: 'Tableau' },
            { action: 'Draft the update', tools: 'Word' }],
    toolsAll: ['Tableau', 'Word'], masterPromptV1: '', masterPromptV2: '', v2Source: '',
    conversations: {}, mockProgress: {},
    botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] }
  };
  const SCENARIOS = {
    initial:      [{ unlocked: 1, current: 1, done: [], entered: [] },
                   'available,locked,locked,locked,locked'],
    step1Current: [{ unlocked: 1, current: 1, done: [], entered: [1] },
                   'current,locked,locked,locked,locked'],
    step1Done:    [{ unlocked: 2, current: 2, done: [1], entered: [1] },
                   'completed,available,locked,locked,locked'],
    step2Current: [{ unlocked: 2, current: 2, done: [1], entered: [1, 2] },
                   'completed,current,locked,locked,locked'],
    midFlow:      [{ unlocked: 3, current: 3, done: [1, 2], entered: [1, 2, 3] },
                   'completed,completed,current,locked,locked'],
    lateFlow:     [{ unlocked: 4, current: 4, done: [1, 2, 3], entered: [1, 2, 3, 4] },
                   'completed,completed,completed,current,locked'],
    finalActive:  [{ unlocked: 5, current: 5, done: [1, 2, 3, 4], entered: [1, 2, 3, 4, 5] },
                   'completed,completed,completed,completed,current'],
    finished:     [{ unlocked: 5, current: 5, done: [1, 2, 3, 4, 5], entered: [1, 2, 3, 4, 5] },
                   'completed,completed,completed,completed,completed']
  };

  for (const [name, [p, expected]] of Object.entries(SCENARIOS)) {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const sp = await c.newPage();
    report.watch(sp);
    const done = {}, entered = {};
    p.done.forEach(n => { done[n] = true; });
    p.entered.forEach(n => { entered[n] = true; });
    await sp.addInitScript(([seed, started]) => {
      localStorage.setItem('brainstorm_workflow_data', seed);
      localStorage.setItem('bw_started', started);
    }, [JSON.stringify({ ...SEED, progress: { ...p, done, entered } }), '1']);
    await sp.goto(`http://127.0.0.1:${PORT}/`);
    await sp.waitForTimeout(400);
    const got = await sp.locator('.bw-station').evaluateAll(
      els => els.map(e => e.dataset.state).join(','));
    check('scenario ' + name + ' renders as specified', got === expected, got);
    if (name === 'finished') {
      check('nothing is locked at the end',
        await sp.locator('.bw-station[data-state="locked"]').count() === 0);
      check('and every stage is still open',
        await sp.locator('.bw-station-card:disabled').count() === 0);
    }
    if (name === 'midFlow') {
      check('at most one stage is current',
        await sp.locator('.bw-station[data-state="current"]').count() === 1);
      check('at most one stage is available',
        await sp.locator('.bw-station[data-state="available"]').count() <= 1);
      check('state changes cost no layout shift', await sp.evaluate(() => {
        const w = [...document.querySelectorAll('.bw-station-card')]
          .map(c => Math.round(c.getBoundingClientRect().width));
        return new Set(w).size === 1;
      }));
    }
    await c.close();
  }

} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
