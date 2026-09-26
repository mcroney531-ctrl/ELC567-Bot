/*
 * The journey contract: what the learner is told, and what the step numbers mean.
 *
 * Two things this guards, both of which have already gone wrong once.
 *
 * The copy. Stage copy outlived two reorders - the landing still walked a
 * sequence with a draft-prompt screen at step 3 long after that screen was
 * retired, and a lesson still told the learner to write their steps "below"
 * when the form had moved to the next stage. Nothing caught either, because
 * every suite tested behaviour and none read what the page says.
 *
 * The coupling. The step numbers and the stage names came apart in the reorder:
 * step 2 is the reading, step 3 is the form. Five places key off the number and
 * have to agree - stepValid, warningFor, GATES, ROLES, and render()'s
 * re-validation list. Changing one and missing the others gives a journey that
 * validates the wrong stage, which is invisible until a learner is stuck. The
 * second half of this file exercises all five through the UI, so drift fails
 * loudly without anything needing to be refactored first.
 *
 * Deliberately loose where the product is unsettled: stage 2's name, blurb and
 * quote are placeholder, so nothing here asserts them.
 */
import { serveSite, makeReporter, loadChromium, readLesson } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('journey contract');
const check = report.check;

const PORT = 8163;
const server = await serveSite(PORT);
const browser = await chromium.launch();
const BASE = `http://127.0.0.1:${PORT}/`;

let ctx, page;
async function open(path = '', seed = null) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1200, height: 950 } });
  page = await ctx.newPage();
  report.watch(page);
  if (seed) {
    await page.addInitScript(s => {
      localStorage.setItem('brainstorm_workflow_data', s);
      localStorage.setItem('bw_started', '1');
    }, JSON.stringify(seed));
  }
  await page.goto(BASE + path);
  await page.waitForTimeout(400);
}

/* A learner's whole journey, finished, for the checks that need one. */
const FINISHED = {
  version: 2,
  problem: 'Every Monday I rebuild eleven client status decks by hand and it eats the morning.',
  steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
          { action: 'Draft each client update', tools: 'Word' }],
  toolsAll: ['Tableau', 'Word'],
  masterPromptV1: '', masterPromptV2: '', v2Source: '',
  conversations: {}, mockProgress: {},
  botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
  progress: { current: 1, unlocked: 5, done: { 1: true, 2: true, 3: true, 4: true },
              entered: { 1: true, 2: true, 3: true, 4: true } }
};

const names = () => page.locator('.bw-card-name').allTextContents();
const visibleText = () => page.evaluate(() => document.body.innerText);

try {
  // ======================= the journey the learner is shown =======================
  await open();
  const landing = await visibleText();

  check('the overview does not promise a different number of phases than the map shows',
    !/three phases/i.test(landing), landing.match(/.{0,60}three phases.{0,60}/i)?.[0]);
  check('it counts the journey as five',
    /five stages/i.test(landing), landing.match(/.{0,80}stages.{0,40}/i)?.[0]);

  /* The worked example walks the journey. Its step labels are the easiest thing
     to leave behind in a reorder, because nothing else reads them. */
  await page.click('.bw-example summary');
  await page.waitForTimeout(200);
  const eyebrows = await page.locator('.bw-example .bw-eyebrow').allTextContents();
  check('the worked example has one row per stage', eyebrows.length === 5,
    JSON.stringify(eyebrows));
  check('numbered in order',
    eyebrows.every((t, i) => t.trim().startsWith('Step ' + (i + 1))), JSON.stringify(eyebrows));
  check('with the workflow at step 3, where the form now lives',
    /workflow/i.test(eyebrows[2]), eyebrows[2]);
  check('and the finished prompt at step 5',
    /prompt/i.test(eyebrows[4]), eyebrows[4]);
  check('it no longer walks the learner through a draft prompt before the end',
    !eyebrows.slice(0, 4).some(t => /draft/i.test(t)), JSON.stringify(eyebrows));

  await page.click('#bw-start');
  await page.waitForTimeout(800);
  check('the map shows five stations', (await names()).length === 5, JSON.stringify(await names()));
  check('Map is the third', (await names())[2] === 'Map', JSON.stringify(await names()));
  check('Envision is not a station any more',
    !(await names()).some(n => /envision/i.test(n)), JSON.stringify(await names()));
  check('and the word does not survive anywhere the learner can read it',
    !/envision/i.test(await visibleText()));

  // ================== no prompt reaches the learner before Deploy ==================
  /* Walked rather than asserted statically: the draft element still exists and
     is still written to, so the only honest check is that no screen shows it. */
  await open('', FINISHED);
  const seen = [];
  for (const stage of [1, 2, 3, 4]) {
    await page.click(`.bw-station[data-stage="${stage}"] .bw-station-card`);
    await page.waitForTimeout(700);
    if (await page.locator('#bw-prompt-v1').isVisible()) seen.push('stage ' + stage + ' lesson');
    await readLesson(page);
    if (await page.locator('#bw-prompt-v1').isVisible()) seen.push('stage ' + stage + ' work');
    await page.click('#bw-to-map');
    await page.waitForTimeout(550);
  }
  check('no stage before Deploy shows the learner a prompt', seen.length === 0,
    seen.join(', '));
  check('and the draft is still being generated behind them', await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('brainstorm_workflow_data')).masterPromptV1 || '').length > 40));

  await page.click('.bw-station[data-stage="5"] .bw-station-card');
  await page.waitForTimeout(700);
  check('Deploy is where a prompt finally appears',
    await page.locator('#bw-prompt-v2').isVisible());

  // ========================= the stage 2 handoff is honest =========================
  await open('', FINISHED);
  await page.click('.bw-station[data-stage="2"] .bw-station-card');
  await page.waitForTimeout(700);
  const turn = await page.locator('.bw-lesson-turn').textContent();
  check('stage 2 does not tell the learner to write anything below it',
    !/below/i.test(turn), turn);
  check('it points at the mapping that actually comes next',
    /step/i.test(turn) && /tool/i.test(turn), turn);
  check('and there is nothing on that screen to write in',
    await page.locator('#bw-lesson-body input, #bw-lesson-body textarea').count() === 0);

  // =========== the five places that must agree about steps 2 and 3 ===========
  /* Behavioural, not structural: each check below fails if one of the coupled
     definitions drifts away from the others, without depending on how any of
     them is written. */

  // stepValid(2): reading is the whole of finishing stage 2, with nothing filled in.
  await open('', { ...FINISHED,
    steps: [{ action: '', tools: '' }, { action: '', tools: '' }], toolsAll: [],
    progress: { current: 2, unlocked: 3, done: { 1: true }, entered: { 1: true } } });
  await page.click('.bw-station[data-stage="2"] .bw-station-card');
  await page.waitForTimeout(700);
  // One explicit Continue rather than readLesson(): if stage 2 stops completing
  // on being read, this has to say so, not time out looking for more pages.
  await page.click('#bw-lesson-next');
  await page.waitForTimeout(700);
  check('stepValid(2): reading stage 2 finishes it, with nothing filled in',
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('brainstorm_workflow_data')).progress.done['2'] === true));

  // warningFor + the panel wiring: the form's complaint belongs to step 3.
  // Continue landed on stage 3's reading; read through it to reach the form.
  await readLesson(page);
  check('warningFor(3): the empty form complains as step 3',
    await page.locator('#bw-cards').isVisible());
  await page.click('[data-next="3"]');
  await page.waitForTimeout(300);
  check('  and shows the step 3 warning', !(await page.locator('#bw-warn-3').isHidden()));
  check('  not a step 2 one', await page.locator('#bw-warn-2').isHidden());

  /* ROLES: the slices render the panels their step numbers now point at. Seeded
     past the gates, because an unfilled slice hides its own body - that is the
     next check, not this one. */
  await open('role/workflow', FINISHED);
  check('ROLES.workflow renders the card form', await page.locator('#bw-cards').isVisible());
  check('  which is panel 3', await page.evaluate(() =>
    document.querySelector('#bw-panel-3 #bw-cards') !== null));
  await open('role/draft', FINISHED);
  check('ROLES.draft renders the retired draft', await page.locator('#bw-prompt-v1').isVisible());
  check('  which is panel 2', await page.evaluate(() =>
    document.querySelector('#bw-panel-2 #bw-prompt-v1') !== null));

  /* GATES: with nothing named, the workflow slice hides its form behind the
     step 3 notice. The gate's step number and its notice id have to match, and
     they are written as a pair in GATES. */
  await open('role/workflow');
  check('GATES: an unfilled workflow slice hides its form',
    !(await page.locator('#bw-workflow-wrap').isVisible()));
  check('  behind the step 3 notice', await page.evaluate(() => {
    const n = document.querySelector('#bw-prereq-3');
    return !!n && !n.hidden && /name the task/i.test(n.textContent);
  }));
  check('  and not a step 2 one', await page.evaluate(() => {
    const n = document.querySelector('#bw-prereq-2');
    return !n || n.hidden;
  }));

  // render() re-validation: breaking the steps un-ticks 3, and leaves 2 alone.
  await open('', { ...FINISHED,
    steps: [{ action: 'only one', tools: 'Excel' }], toolsAll: ['Excel'] });
  const states = () => page.locator('.bw-station')
    .evaluateAll(els => els.map(e => e.dataset.state).join(','));
  check('render(): a stage 3 that no longer validates loses its tick',
    (await states()).split(',')[2] !== 'completed', await states());
  check('  while stage 2, which cannot break, keeps its own',
    (await states()).split(',')[1] === 'completed', await states());
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
