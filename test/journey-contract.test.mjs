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
 * The coupling. Several definitions key off a stage number and have to agree
 * about what that number means - stepValid, warningFor, GATES, ROLES, and
 * render()'s re-validation list. Changing one and missing the others gives a
 * journey that validates the wrong stage, which is invisible until a learner is
 * stuck. The second half of this file exercises all of them through the UI, so
 * drift fails loudly without anything needing to be refactored first.
 *
 * The journey is Identify, Map, Envision, Refine, Deploy. Map is one stage: it
 * reads twice and then asks for the steps, so the reading and the form share a
 * number rather than sitting either side of one.
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
  version: 3,
  problem: 'Every Monday I rebuild eleven client status decks by hand and it eats the morning.',
  steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
          { action: 'Draft each client update', tools: 'Word' }],
  toolsAll: ['Tableau', 'Word'],
  masterPromptV1: '', masterPromptV2: '', v2Source: '',
  idealOutcome: 'The decks go out before lunch without me rebuilding each one by hand.',
  aiRole: 'Assemble the routine parts from the numbers so I am reviewing rather than retyping.',
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
  check('and walks them in the order the map does', await page.evaluate(() => {
    const t = document.body.innerText.toLowerCase();
    const at = s => t.indexOf(s);
    return at('identifying the task') < at('mapping how it actually') &&
           at('mapping how it actually') < at('picturing the better version') &&
           at('picturing the better version') < at('refining that into specifics');
  }));

  /* The worked example walks the journey. Its step labels are the easiest thing
     to leave behind in a reorder, because nothing else reads them. */
  await page.click('.bw-example summary');
  await page.waitForTimeout(200);
  const eyebrows = await page.locator('.bw-example .bw-eyebrow').allTextContents();
  check('the worked example has one row per stage', eyebrows.length === 5,
    JSON.stringify(eyebrows));
  check('numbered in order',
    eyebrows.every((t, i) => t.trim().startsWith('Step ' + (i + 1))), JSON.stringify(eyebrows));
  check('with the workflow at step 2, where the mapping now lives',
    /workflow/i.test(eyebrows[1]), eyebrows[1]);
  check('the version she wants at step 3',
    /wants|version/i.test(eyebrows[2]), eyebrows[2]);
  check('and the finished prompt at step 5',
    /prompt/i.test(eyebrows[4]), eyebrows[4]);
  check('it no longer walks the learner through a draft prompt before the end',
    !eyebrows.slice(0, 4).some(t => /draft/i.test(t)), JSON.stringify(eyebrows));
  check('the worked step 3 shows both halves of the vision, not one', await page.evaluate(() => {
    const row = [...document.querySelectorAll('.bw-example .bw-eyebrow')]
      .find(e => /step 3/i.test(e.textContent)).parentElement.innerText.toLowerCase();
    return row.includes('ideal outcome') && row.includes("ai's role");
  }));

  await page.click('#bw-start');
  await page.waitForTimeout(800);
  check('the map shows five stations', (await names()).length === 5, JSON.stringify(await names()));
  check('in the settled order',
    (await names()).join(',') === 'Identify,Map,Envision,Refine,Deploy',
    JSON.stringify(await names()));
  check('Describe is not a station of its own any more',
    !(await names()).some(n => /describe/i.test(n)), JSON.stringify(await names()));

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
  check('and Deploy teaches before it reveals',
    await page.locator('#bw-lesson-body').isVisible() &&
    !(await page.locator('#bw-prompt-v2').isVisible()));
  await readLesson(page);
  check('Deploy is where a prompt finally appears',
    await page.locator('#bw-prompt-v2').isVisible());

  // ===================== Map's reading hands off to Map's form =====================
  await open('', FINISHED);
  await page.click('.bw-station[data-stage="2"] .bw-station-card');
  await page.waitForTimeout(700);
  const turn = await page.locator('.bw-lesson-turn').textContent();
  check('Map\'s first page does not tell the learner to write anything below it',
    !/below/i.test(turn), turn);
  check('it points at the mapping that actually comes next',
    /step/i.test(turn) && /next/i.test(turn), turn);
  check('and there is nothing on that screen to write in',
    await page.locator('#bw-lesson-body input, #bw-lesson-body textarea').count() === 0);
  await readLesson(page);
  check('the form is in the same stage the reading was, not the next one',
    await page.locator('#bw-cards').isVisible() &&
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '2',
    await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage'));
  check('and it is panel 2 that holds it', await page.evaluate(() =>
    document.querySelector('#bw-panel-2 #bw-cards') !== null));

  // ============= the places that must agree about what each number means =============
  /* Behavioural, not structural: each check below fails if one of the coupled
     definitions drifts away from the others, without depending on how any of
     them is written. */

  // stepValid(2): the steps are the whole of finishing Map. Reading is not enough.
  await open('', { ...FINISHED,
    steps: [{ action: '', tools: '' }, { action: '', tools: '' }], toolsAll: [],
    progress: { current: 2, unlocked: 2, done: { 1: true }, entered: { 1: true } } });
  await page.click('.bw-station[data-stage="2"] .bw-station-card');
  await page.waitForTimeout(700);
  await readLesson(page);
  check('stepValid(2): reading Map does not finish it while the form is empty',
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('brainstorm_workflow_data')).progress.done['2'] !== true));
  check('warningFor(2): the empty form complains as step 2',
    await page.locator('#bw-cards').isVisible());
  await page.click('[data-next="2"]');
  await page.waitForTimeout(300);
  check('  and shows the step 2 warning', !(await page.locator('#bw-warn-2').isHidden()));
  check('  about the steps and their tools',
    /steps/i.test(await page.locator('#bw-warn-2').textContent()),
    await page.locator('#bw-warn-2').textContent());
  check('  not a step 3 one', await page.locator('#bw-warn-3').isHidden());

  // stepValid(3): Envision needs both answers, and its complaint is step 3's.
  await open('', { ...FINISHED, idealOutcome: '', aiRole: '',
    progress: { current: 3, unlocked: 3, done: { 1: true, 2: true },
                entered: { 1: true, 2: true } } });
  await page.click('.bw-station[data-stage="3"] .bw-station-card');
  await page.waitForTimeout(700);
  await readLesson(page);
  check('stepValid(3): reading Envision does not finish it either',
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('brainstorm_workflow_data')).progress.done['3'] !== true));
  await page.click('[data-next="3"]');
  await page.waitForTimeout(300);
  check('warningFor(3): the empty vision shows the step 3 warning',
    !(await page.locator('#bw-warn-3').isHidden()));
  check('  about the outcome, which is the first thing missing',
    /better about the finished workflow/i.test(await page.locator('#bw-warn-3').textContent()),
    await page.locator('#bw-warn-3').textContent());
  check('  not a step 2 one', await page.locator('#bw-warn-2').isHidden());

  /* Map's validation has to say what Map's copy says. A looser rule - enough
     actions plus one tool anywhere - let two steps with one tool between them
     pass, which contradicted the warning on screen and disagreed with what the
     v2 upgrade counts as mapped. */
  await open('', { ...FINISHED,
    steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
            { action: 'Draft each client update', tools: '' }],
    toolsAll: ['Tableau'],
    progress: { current: 2, unlocked: 2, done: { 1: true }, entered: { 1: true } } });
  await page.click('.bw-station[data-stage="2"] .bw-station-card');
  await page.waitForTimeout(700);
  await readLesson(page);
  await page.click('[data-next="2"]');
  await page.waitForTimeout(300);
  check('a step without its tool does not count as mapped',
    !(await page.locator('#bw-warn-2').isHidden()) &&
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '2',
    await page.locator('#bw-warn-2').textContent());
  check('and the map agrees it is unfinished', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('brainstorm_workflow_data')).progress.done['2'] !== true));
  await page.fill('#bw-cards .bw-card:nth-child(2) .bw-card-tools textarea, ' +
    '#bw-cards .bw-card:nth-child(2) .bw-card-tools input', 'Word');
  await page.waitForTimeout(300);
  await page.click('[data-next="2"]');
  await page.waitForTimeout(700);
  check('giving it one finishes the stage',
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '3',
    await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage'));

  /* Enough complete rows, plus one left half-written: still not done, and the
     complaint has to stop saying "at least two" to someone who has three. */
  await open('', { ...FINISHED,
    steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
            { action: 'Draft each client update', tools: 'Word' },
            { action: 'Reformat into the deck', tools: '' }],
    toolsAll: ['Tableau', 'Word'],
    progress: { current: 2, unlocked: 2, done: { 1: true }, entered: { 1: true } } });
  await page.click('.bw-station[data-stage="2"] .bw-station-card');
  await page.waitForTimeout(700);
  await readLesson(page);
  await page.click('[data-next="2"]');
  await page.waitForTimeout(300);
  check('a half-written row holds the stage even with enough finished ones',
    !(await page.locator('#bw-warn-2').isHidden()));
  check('and the complaint names the real problem',
    /other half/i.test(await page.locator('#bw-warn-2').textContent()),
    await page.locator('#bw-warn-2').textContent());

  /* The upgrade and the live journey have to mean the same thing by "mapped".
     A v2 save of action-only rows must not arrive with Map already ticked. */
  await open('', { version: 2,
    problem: FINISHED.problem,
    steps: [{ action: 'Pull the delivery numbers', tools: '' },
            { action: 'Draft each client update', tools: '' }],
    toolsAll: [], masterPromptV1: '', masterPromptV2: '', v2Source: '',
    conversations: {}, mockProgress: {},
    botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
    progress: { current: 3, unlocked: 3, done: { 1: true, 2: true },
                entered: { 1: true, 2: true } } });
  check('the upgrade and live validation agree about what counts as mapped',
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('brainstorm_workflow_data'));
      return d.progress.done['2'] !== true;
    }));
  check('which is what the learner is shown',
    (await page.locator('.bw-station').evaluateAll(
      els => els.map(e => e.dataset.state).join(','))).split(',')[1] !== 'completed',
    await page.locator('.bw-station').evaluateAll(
      els => els.map(e => e.dataset.state).join(',')));

  /* Start over has to clear every warning, not the ones a previous ordering
     happened to list. This is the shape of bug the whole file exists for. */
  await open('', { ...FINISHED,
    steps: [{ action: '', tools: '' }, { action: '', tools: '' }], toolsAll: [],
    idealOutcome: '', aiRole: '',
    progress: { current: 2, unlocked: 2, done: { 1: true }, entered: { 1: true } } });
  await page.click('.bw-station[data-stage="2"] .bw-station-card');
  await page.waitForTimeout(700);
  await readLesson(page);
  await page.click('[data-next="2"]');
  await page.waitForTimeout(300);
  check('a warning is showing before the reset',
    !(await page.locator('#bw-warn-2').isHidden()));
  await page.click('#bw-reset');
  await page.click('#bw-reset');          // inline confirm: the second press commits
  await page.waitForTimeout(800);
  check('start over leaves no warning behind on any stage',
    await page.evaluate(() => [1, 2, 3, 4, 5]
      .map(n => document.getElementById('bw-warn-' + n))
      .filter(Boolean)
      .every(box => box.hidden && !box.textContent)),
    await page.evaluate(() => [1, 2, 3, 4, 5]
      .map(n => document.getElementById('bw-warn-' + n))
      .filter(Boolean)
      .map(b => b.id + '=' + (b.hidden ? 'hidden' : 'SHOWING')).join(' ')));

  /* ROLES: the slices render the panels their step numbers now point at. Seeded
     past the gates, because an unfilled slice hides its own body - that is the
     next check, not this one. */
  await open('role/workflow', FINISHED);
  check('ROLES.workflow renders the card form', await page.locator('#bw-cards').isVisible());
  check('  which is panel 2', await page.evaluate(() =>
    document.querySelector('#bw-panel-2 #bw-cards') !== null));
  await open('role/draft', FINISHED);
  check('ROLES.draft renders the retired draft', await page.locator('#bw-prompt-v1').isVisible());
  check('  from outside the step list, so no stage can show it', await page.evaluate(() =>
    document.querySelector('.bw-retired #bw-prompt-v1') !== null &&
    document.querySelector('.bw-steps #bw-prompt-v1') === null));

  /* The preview role is the only thing that reveals the retired container. The
     full activity must leave it hidden, whatever stage is open. */
  await open('', FINISHED);
  const leaked = [];
  for (const stage of [1, 2, 3, 4, 5]) {
    await page.click(`.bw-station[data-stage="${stage}"] .bw-station-card`);
    await page.waitForTimeout(700);
    if (!(await page.locator('#bw-draft-wrap').evaluate(e => e.hidden))) {
      leaked.push('stage ' + stage);
    }
    await page.click('#bw-to-map');
    await page.waitForTimeout(550);
  }
  check('the retired draft container stays hidden in the full activity',
    leaked.length === 0, leaked.join(', '));

  /* GATES: with nothing named, the workflow slice hides its form behind the
     step 2 notice. The gate's step number and its notice id have to match, and
     they are written as a pair in GATES. */
  await open('role/workflow');
  check('GATES: an unfilled workflow slice hides its form',
    !(await page.locator('#bw-workflow-wrap').isVisible()));
  check('  behind the step 2 notice', await page.evaluate(() => {
    const n = document.querySelector('#bw-prereq-2');
    return !!n && !n.hidden && /name the task/i.test(n.textContent);
  }));
  check('  and not a step 3 one', await page.evaluate(() => {
    const n = document.querySelector('#bw-prereq-3');
    return !n || n.hidden;
  }));

  // render() re-validation: each stage that can break loses its own tick only.
  await open('', { ...FINISHED,
    steps: [{ action: 'only one', tools: 'Excel' }], toolsAll: ['Excel'] });
  const states = () => page.locator('.bw-station')
    .evaluateAll(els => els.map(e => e.dataset.state).join(','));
  check('render(): a Map that no longer validates loses its tick',
    (await states()).split(',')[1] !== 'completed', await states());
  check('  while Identify, which still validates, keeps its own',
    (await states()).split(',')[0] === 'completed', await states());

  await open('', { ...FINISHED, aiRole: '' });
  check('render(): half a vision is not a finished Envision',
    (await states()).split(',')[2] !== 'completed', await states());
  check('  and the stages either side are untouched',
    (await states()).split(',')[1] === 'completed' &&
    (await states()).split(',')[3] === 'completed', await states());
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
