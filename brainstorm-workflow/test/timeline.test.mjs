/*
 * The journey map: five stations on a spine, one workspace, and the rules for
 * moving between them. What matters here is the navigation model rather than
 * the art - the cards are meant to be redrawn, so nothing below asserts on a
 * colour, a size, or an illustration.
 */
import { serveSite, makeReporter, loadChromium } from './helpers.mjs';

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
const statusOf = n => station(n).locator('.bw-station-status').textContent();
const enter = async n => {
  await station(n).locator('.bw-station-card').click();
  await page.waitForTimeout(650);
};
const toMap = async () => { await page.click('#bw-to-map'); await page.waitForTimeout(550); };
const fillStage1 = async () => {
  await page.fill('#bw-problem',
    'Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.');
  await page.click('[data-next="1"]');
  await page.waitForTimeout(550);
};

try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);

  // ---------------------------------------------------------------- the map
  check('the map is home', await page.locator('#bw-map').isVisible());
  check('the workspace is not', !(await page.locator('#bw-stage').isVisible()));
  check('five stations', await page.locator('.bw-station').count() === 5);
  check('named for the practice, not this activity',
    (await page.locator('.bw-station-name').allTextContents()).join(',') ===
    'Identify,Map,Envision,Refine,Deploy',
    (await page.locator('.bw-station-name').allTextContents()).join(','));
  check('they alternate above and below the line',
    (await page.locator('.bw-station').evaluateAll(
      els => els.map(e => e.dataset.place).join(','))) === 'above,below,above,below,above');
  check('every station has artwork', await page.locator('.bw-station-art svg').count() === 5);
  check('the spine carries a rail', await page.locator('.bw-rail').isVisible());

  // ------------------------------------------------------------ first states
  check('stage 1 is available', await stateOf(1) === 'available', await stateOf(1));
  check('and is flagged as where to go', await station(1).getAttribute('data-current') === 'true');
  check('stages 2 to 5 are locked',
    (await Promise.all([2, 3, 4, 5].map(stateOf))).join(',') === 'locked,locked,locked,locked');
  check('a locked station says which stage opens it',
    (await statusOf(3)) === 'Finish Map first', await statusOf(3));
  check('an available station describes itself',
    (await statusOf(1)) === 'Name a problem worth solving', await statusOf(1));
  check('locked cards are not clickable', await station(4).locator('.bw-station-card').isDisabled());
  check('the map tells them where to pick up',
    (await page.locator('#bw-map-hint').textContent()).includes('Identify'));

  // ------------------------------------------------------------ enter a stage
  await enter(1);
  check('entering swaps the map for the workspace',
    !(await page.locator('#bw-map').isVisible()) && await page.locator('#bw-stage').isVisible());
  check('only the entered stage is on screen',
    await page.locator('.bw-step:visible').count() === 1,
    String(await page.locator('.bw-step:visible').count()));
  check('and it is the right one',
    await page.locator('.bw-step:visible').getAttribute('data-step') === '1');
  check('the workspace says where you are',
    (await page.locator('#bw-stage-where').textContent()) === 'Stage 1 of 5 · Identify',
    await page.locator('#bw-stage-where').textContent());
  check('the workspace does not repeat the whole timeline',
    !(await page.locator('.bw-spine').isVisible()));
  check('there is a way back', await page.locator('#bw-to-map').isVisible());

  // -------------------------------------------------- back out without finishing
  await toMap();
  check('back returns to the map', await page.locator('#bw-map').isVisible());
  check('and nothing was marked done', await stateOf(1) === 'available', await stateOf(1));

  // ------------------------------------------------ finish one, continue onward
  await enter(1);
  await fillStage1();
  check('continuing stays in the workspace',
    await page.locator('#bw-stage').isVisible() && !(await page.locator('#bw-map').isVisible()));
  check('and lands on the next stage',
    await page.locator('.bw-step:visible').getAttribute('data-step') === '2');
  check('the indicator moved with it',
    (await page.locator('#bw-stage-where').textContent()) === 'Stage 2 of 5 · Map',
    await page.locator('#bw-stage-where').textContent());

  // ------------------------------------------------------ the completed state
  await toMap();
  check('the finished stage reads done', await stateOf(1) === 'done', await stateOf(1));
  check('with a status built from state, not prose',
    (await statusOf(1)) === 'Complete · Task defined', await statusOf(1));
  check('it is no longer the current one', await station(1).getAttribute('data-current') === 'false');
  check('the next stage opened', await stateOf(2) === 'available', await stateOf(2));
  check('and became the current one', await station(2).getAttribute('data-current') === 'true');
  check('the stage after it is still locked', await stateOf(3) === 'locked');
  check('done is visually distinct from locked', await page.evaluate(() => {
    const art = s => getComputedStyle(document.querySelector(
      `.bw-station[data-state="${s}"] .bw-station-art`)).backgroundColor;
    return art('done') !== art('locked');
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
  check('the connector fills as stages complete', await page.evaluate(() => {
    const f = document.querySelector('#bw-rail-fill');
    return parseFloat(f.style.width) > 0;
  }));

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
  check('and stage 1, which does still hold, stays done',
    (await odd.locator('.bw-station[data-stage="1"]').getAttribute('data-state')) === 'done');
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
  const soloStatus = await solo.locator('.bw-station[data-stage="2"] .bw-station-status').textContent();
  check('one mapped step reads "1 step", not "1 steps"',
    soloStatus === 'Complete \u00b7 1 step mapped', soloStatus);
  await soloCtx.close();
  soloServer.close();

  // ------------------------------------------------------------- reduced motion
  const rmCtx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1100, height: 900 } });
  const rm = await rmCtx.newPage();
  report.watch(rm);
  await rm.goto(`http://127.0.0.1:${PORT}/`);
  await rm.waitForTimeout(300);
  await rm.locator('.bw-station[data-stage="1"] .bw-station-card').click();
  await rm.waitForTimeout(300);
  check('navigation still works with motion turned off',
    await rm.locator('#bw-stage').isVisible() && !(await rm.locator('#bw-map').isVisible()));
  await rmCtx.close();

  // ------------------------------------------------------------- narrow screens
  await page.setViewportSize({ width: 360, height: 780 });
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
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
