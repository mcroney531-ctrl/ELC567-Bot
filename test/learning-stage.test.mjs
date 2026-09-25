/*
 * The learning stage: the inside of a step.
 *
 * Two things matter more than the styling. First, the top mini-node strip and
 * the journey map read the same state model, so they cannot tell the learner
 * different stories. Second, the page chrome does not change with the stage -
 * only the mini nodes carry progression, and stage identity is confined to the
 * number, the illustration and the progress fill.
 */
import { serveSite, makeReporter, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('learning stage');
const check = report.check;

const PORT = 8156;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const SEED = {
  version: 2,
  problem: 'Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.',
  steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
          { action: 'Draft each client update', tools: 'Word' },
          { action: 'Reformat into the deck', tools: 'PowerPoint' }],
  toolsAll: ['Tableau', 'Word', 'PowerPoint'],
  masterPromptV1: '', masterPromptV2: '', v2Source: '',
  conversations: {}, mockProgress: {},
  botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] }
};

/* Opens straight into a stage from seeded progress, which is the only way to
   reach the later scenarios without walking the whole activity. */
async function openStage(progress, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 },
    reducedMotion: opts.reducedMotion
  });
  const page = await ctx.newPage();
  report.watch(page);
  const done = {}, entered = {};
  (progress.done || []).forEach(n => { done[n] = true; });
  (progress.entered || []).forEach(n => { entered[n] = true; });
  await page.addInitScript(seed => {
    localStorage.setItem('brainstorm_workflow_data', seed);
    localStorage.setItem('bw_started', '1');
  }, JSON.stringify({ ...SEED, progress: { ...progress, done, entered } }));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);
  await page.click(`.bw-station[data-stage="${progress.open}"] .bw-station-card`);
  await page.waitForTimeout(700);
  return { ctx, page };
}

const miniStates = page => page.locator('.bw-mini-item').evaluateAll(
  els => els.map(e => e.dataset.state).join(','));

try {
  // ============================ the shell ============================
  let { ctx, page } = await openStage({ unlocked: 1, current: 1, open: 1, done: [], entered: [] });

  check('entering a stage shows the learning stage', await page.locator('#bw-stage').isVisible());
  check('a dark shell bar sits above it', await page.locator('.bw-ls-top').isVisible());
  check('with a way back to the journey', await page.locator('#bw-to-map').isVisible());
  check('the body is split into context and workspace',
    await page.locator('.bw-ls-context').isVisible() && await page.locator('.bw-ls-work').isVisible());
  check('the context panel is the narrower side', await page.evaluate(() => {
    const l = document.querySelector('.bw-ls-context').getBoundingClientRect().width;
    const r = document.querySelector('.bw-ls-work').getBoundingClientRect().width;
    const share = l / (l + r);
    return share > 0.24 && share < 0.4;
  }));
  check('the shell is dark and the workspace is light', await page.evaluate(() => {
    const lum = el => {
      const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g).map(Number);
      return (r + g + b) / 3;
    };
    return lum(document.querySelector('.bw-ls-top')) < 70 &&
           lum(document.querySelector('.bw-ls-work')) > 200 &&
           lum(document.querySelector('.bw-ls-context')) > 200;
  }));

  // ---- the step's own accordion header must not duplicate the panel ----
  check('the old step header is gone from the workspace',
    !(await page.locator('.bw-step-head').first().isVisible()));
  check('the lesson header takes its place',
    (await page.locator('#bw-lesson-label').textContent()) === 'Lesson 1' &&
    (await page.locator('#bw-lesson-title').textContent()).length > 0,
    await page.locator('#bw-lesson-title').textContent());
  check('and the lesson title is the step\'s own heading', await page.evaluate(() =>
    document.querySelector('#bw-lesson-title').textContent ===
    document.querySelector('.bw-step[data-step="1"] .bw-h2').textContent));

  // ---- the context panel ----
  check('the context panel carries the stage number',
    (await page.locator('#bw-ls-num').textContent()) === '01');
  check('the stage name', (await page.locator('#bw-ls-name').textContent()) === 'Identify');
  check('one framing sentence',
    (await page.locator('#bw-ls-framing').textContent()).length > 10);
  check('an illustration', await page.locator('#bw-ls-art svg').count() === 1);
  check('a step-of cue', (await page.locator('#bw-ls-step').textContent()) === 'Step 1 of 5');
  check('and a short supporting line',
    (await page.locator('#bw-ls-quote').textContent()).includes('Clarity today'));
  check('the context panel is not a second instructional column',
    await page.locator('.bw-ls-context p, .bw-ls-context h2').count() <= 6,
    String(await page.locator('.bw-ls-context p, .bw-ls-context h2').count()));

  // ---- a lesson stage is artwork and prose, and nothing to fill in ----
  check('the lesson is on screen', await page.locator('#bw-lesson-body').isVisible());
  check('with a heading', (await page.locator('#bw-lesson-title').textContent()).trim().length > 0);
  check('and prose', (await page.locator('#bw-lesson-copy').textContent()).trim().length > 80);
  check('the lesson\'s picture is an explainer card, in the context panel',
    await page.locator('.bw-ls-context #bw-ls-lesson-img').isVisible() &&
    await page.locator('.bw-ls-work img, .bw-ls-work svg').count() === 0,
    'work art=' + await page.locator('.bw-ls-work img, .bw-ls-work svg').count());
  check('standing in for the stage icon, so one picture at a time',
    !(await page.locator('#bw-ls-art').isVisible()));
  check('the card loads', await page.evaluate(() => {
    const img = document.querySelector('#bw-ls-lesson-img');
    return img.complete && img.naturalWidth > 0;
  }));
  check('and its words reach a screen reader',
    (await page.locator('#bw-ls-lesson-img').getAttribute('alt')).includes('Plan beyond the chat'));
  check('nothing to fill in', !(await page.locator('#bw-problem').isVisible()));
  check('no examples panel to work from', !(await page.locator('#bw-examples').isVisible()));
  check('and no info strip', !(await page.locator('#bw-info-strip').isVisible()));
  check('save draft rides along with continue', await page.evaluate(() => {
    const save = document.querySelector('#bw-save-draft');
    const next = document.querySelector('#bw-lesson-next');
    return save && next && save.parentElement === next.parentElement;
  }));
  await page.click('#bw-save-draft');
  await page.waitForTimeout(200);
  check('save draft confirms the save',
    (await page.locator('#bw-saved').textContent()).includes('Saved'),
    await page.locator('#bw-saved').textContent());

  // ============================ mini nodes ============================
  check('five mini nodes', await page.locator('.bw-mini-item').count() === 5);
  check('labelled with number and stage',
    (await page.locator('.bw-mini-label').first().textContent()) === '01 Identify',
    await page.locator('.bw-mini-label').first().textContent());
  check('in the journey order',
    (await page.locator('.bw-mini-label').allTextContents()).join('|') ===
    '01 Identify|02 Map|03 Envision|04 Refine|05 Deploy');
  check('the open stage is marked for assistive tech',
    await page.locator('.bw-mini-item[data-stage="1"] .bw-mini-node')
      .getAttribute('aria-current') === 'step');
  check('the strip carries one neutral connector per gap, never a state colour',
    await page.evaluate(() => {
      const c = getComputedStyle(document.querySelector('.bw-mini-item:nth-child(2)'), '::before');
      return c.content !== 'none' && !/(56, 227|40, 242)/.test(c.backgroundColor);
    }));
  await ctx.close();

  // ---- a stage without a written lesson still shows its own panel ----
  ({ ctx, page } = await openStage({ unlocked: 2, current: 2, open: 2, done: [1], entered: [1, 2] }));
  check('a stage without a lesson keeps its workspace',
    await page.locator('#bw-cards').isVisible());
  check('and its stage icon, with no explainer card',
    await page.locator('#bw-ls-art svg').isVisible() &&
    !(await page.locator('#bw-ls-lesson-art').isVisible()));
  check('and its own input, not the lesson',
    !(await page.locator('#bw-lesson-body').isVisible()));
  check('save draft sits next to that stage\'s continue', await page.evaluate(() => {
    const save = document.querySelector('#bw-save-draft');
    const next = document.querySelector('[data-next="2"]');
    return save && next && save.parentElement === next.parentElement;
  }));

  /* The step card and the journey map's station cards share the .bw-card-*
     namespace while being different components in different stylesheets. An
     unscoped station rule reaching this card tore its number out of the grid
     and shifted every field a column left, so these check the shape rather
     than trusting the naming. */
  const cardGeom = () => page.evaluate(() => {
    const card = document.querySelector('#bw-cards .bw-card');
    const box = sel => { const r = card.querySelector(sel).getBoundingClientRect();
      return { l: r.left, w: r.width, h: r.height }; };
    const num = card.querySelector('.bw-card-num');
    return {
      card: card.getBoundingClientRect(),
      num: { ...box('.bw-card-num'), pos: getComputedStyle(num).position },
      action: box('.bw-card-action'), tools: box('.bw-card-tools'),
      label: box('.bw-card-action .bw-label')
    };
  });
  let c = await cardGeom();
  check('the step number stays inside its own card',
    c.num.l >= c.card.left && c.num.l < c.card.right, JSON.stringify(c.num));
  check('and stays in the grid rather than being positioned out of it',
    c.num.pos === 'static', c.num.pos);
  check('so the action field gets a real column, not the number\'s',
    c.action.w > 120, JSON.stringify(c.action));
  check('and is the wider of the two fields',
    c.action.w >= c.tools.w, c.action.w + ' vs ' + c.tools.w);
  check('leaving its label on one line', c.label.h < 26, String(c.label.h));

  // Narrow enough that the two fields stack, which is a different code path.
  await page.setViewportSize({ width: 560, height: 900 });
  await page.waitForTimeout(300);
  c = await cardGeom();
  check('stacked, the fields still clear the number column',
    c.action.l > c.card.left + 12 && c.action.w > 150, JSON.stringify(c.action));
  check('and the number is still inside the card',
    c.num.l >= c.card.left && c.num.l < c.card.right, JSON.stringify(c.num));
  check('with the label still on one line', c.label.h < 26, String(c.label.h));
  await ctx.close();

  // Stage 4 is a panel stage with an info strip, which is where that machinery
  // is still reachable now that stage 1 is a lesson.
  ({ ctx, page } = await openStage(
    { unlocked: 4, current: 4, open: 4, done: [1, 2, 3], entered: [1, 2, 3, 4] }));
  check('a panel stage can carry an info strip',
    await page.locator('#bw-info-strip').isVisible());
  check('which says what the coach already has',
    (await page.locator('#bw-info-strip').textContent()).includes('your steps and your tools'));
  await ctx.close();

  // ---------------- the four states, in the compressed strip ----------------
  ({ ctx, page } = await openStage({ unlocked: 1, current: 1, open: 1, done: [], entered: [1] }));
  check('stage 1 current, the rest locked',
    await miniStates(page) === 'current,locked,locked,locked,locked', await miniStates(page));
  check('locked mini nodes are not enterable',
    await page.locator('.bw-mini-item[data-state="locked"] .bw-mini-node:disabled').count() === 4);
  check('and show a lock rather than the stage icon', await page.evaluate(() => {
    const n = document.querySelector('.bw-mini-item[data-state="locked"]');
    return getComputedStyle(n.querySelector('.bw-mini-lock')).display !== 'none' &&
           getComputedStyle(n.querySelector('.bw-mini-icon')).display === 'none';
  }));
  await ctx.close();

  ({ ctx, page } = await openStage({ unlocked: 3, current: 3, open: 3, done: [1, 2], entered: [1, 2, 3] }));
  check('two completed, one current, two locked',
    await miniStates(page) === 'completed,completed,current,locked,locked', await miniStates(page));
  check('completed mini nodes use a star, not a check', await page.evaluate(() => {
    const n = document.querySelector('.bw-mini-item[data-state="completed"]');
    return getComputedStyle(n.querySelector('.bw-mini-star')).display !== 'none' &&
           getComputedStyle(n.querySelector('.bw-mini-icon')).display === 'none';
  }));
  check('and the star keeps the stage colour rather than one blue for all',
    await page.evaluate(() => {
      const bg = s => getComputedStyle(
        document.querySelector(`.bw-mini-item[data-accent="${s}"] .bw-mini-node`)).backgroundColor;
      return bg('identify') !== bg('map');
    }));
  check('completed mini nodes stay revisitable',
    await page.locator('.bw-mini-item[data-state="completed"] .bw-mini-node:disabled').count() === 0);
  check('the open stage is stage 3',
    await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage') === '3');
  check('the context panel followed it',
    (await page.locator('#bw-ls-name').textContent()) === 'Envision');
  check('as did the progress cue',
    (await page.locator('#bw-ls-step').textContent()) === 'Step 3 of 5');

  // ---- the page itself does not take on the stage colour ----
  const chrome3 = await page.evaluate(() => ({
    top: getComputedStyle(document.querySelector('.bw-ls-top')).backgroundColor,
    work: getComputedStyle(document.querySelector('.bw-ls-work')).backgroundColor,
    panel: getComputedStyle(document.querySelector('.bw-ls-context')).backgroundColor
  }));

  // ---- a mini node navigates ----
  await page.click('.bw-mini-item[data-stage="1"] .bw-mini-node');
  await page.waitForTimeout(500);
  check('clicking a completed mini node goes back to that stage',
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '1' &&
    await page.locator('#bw-lesson-body').isVisible(),
    await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage'));
  check('and the context panel is stage 1 again',
    (await page.locator('#bw-ls-name').textContent()) === 'Identify');
  const chrome1 = await page.evaluate(() => ({
    top: getComputedStyle(document.querySelector('.bw-ls-top')).backgroundColor,
    work: getComputedStyle(document.querySelector('.bw-ls-work')).backgroundColor,
    panel: getComputedStyle(document.querySelector('.bw-ls-context')).backgroundColor
  }));
  check('the shell, workspace and panel are identical across stages',
    JSON.stringify(chrome1) === JSON.stringify(chrome3),
    JSON.stringify(chrome1) + ' vs ' + JSON.stringify(chrome3));
  check('while the stage number does change colour', await page.evaluate(() => {
    const now = getComputedStyle(document.querySelector('#bw-ls-num')).color;
    return now !== getComputedStyle(document.querySelector('.bw-ls-work')).color;
  }));
  await ctx.close();

  ({ ctx, page } = await openStage(
    { unlocked: 5, current: 5, open: 5, done: [1, 2, 3, 4, 5], entered: [1, 2, 3, 4, 5] }));
  check('all completed reads as all completed',
    await miniStates(page) === 'completed,completed,completed,completed,completed',
    await miniStates(page));
  check('nothing is locked at the end',
    await page.locator('.bw-mini-item .bw-mini-node:disabled').count() === 0);
  await ctx.close();

  ({ ctx, page } = await openStage({ unlocked: 2, current: 1, open: 1, done: [1], entered: [1] }));
  check('a finished stage you are revisiting still reads completed',
    await miniStates(page) === 'completed,available,locked,locked,locked', await miniStates(page));
  check('the next one is available, calm rather than pulsing', await page.evaluate(() => {
    const n = document.querySelector('.bw-mini-item[data-state="available"] .bw-mini-node');
    return getComputedStyle(n).animationName === 'none';
  }));
  check('available mini nodes are enterable',
    !(await page.locator('.bw-mini-item[data-state="available"] .bw-mini-node').isDisabled()));
  await ctx.close();

  // ============================ motion off ============================
  ({ ctx, page } = await openStage(
    { unlocked: 1, current: 1, open: 1, done: [], entered: [1] }, { reducedMotion: 'reduce' }));
  check('the current mini node does not pulse with motion turned off',
    await page.evaluate(() => getComputedStyle(
      document.querySelector('.bw-mini-item[data-state="current"] .bw-mini-node')).animationName) === 'none');
  check('but it is still distinguishable', await page.evaluate(() => {
    const cur = document.querySelector('.bw-mini-item[data-state="current"] .bw-mini-node');
    const lock = document.querySelector('.bw-mini-item[data-state="locked"] .bw-mini-node');
    return getComputedStyle(cur).borderTopWidth !== getComputedStyle(lock).borderTopWidth ||
           getComputedStyle(cur).borderTopColor !== getComputedStyle(lock).borderTopColor;
  }));
  await ctx.close();

  // ============================ keyboard ============================
  ({ ctx, page } = await openStage({ unlocked: 2, current: 2, open: 2, done: [1], entered: [1, 2] }));
  await page.locator('.bw-mini-item[data-stage="1"] .bw-mini-node').focus();
  check('mini nodes take focus', await page.evaluate(() =>
    document.activeElement.classList.contains('bw-mini-node')));
  check('and show it', await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement, null);
    return s.outlineStyle !== 'none' || s.boxShadow !== 'none';
  }));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check('and activate from the keyboard',
    (await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage')) === '1',
    await page.locator('.bw-mini-item[data-open="true"]').getAttribute('data-stage'));
  await ctx.close();

  // ============================ responsive ============================
  ({ ctx, page } = await openStage(
    { unlocked: 3, current: 3, open: 3, done: [1, 2], entered: [1, 2, 3] },
    { viewport: { width: 380, height: 900 } }));
  check('the split stacks on a narrow viewport', await page.evaluate(() => {
    const l = document.querySelector('.bw-ls-context').getBoundingClientRect();
    const r = document.querySelector('.bw-ls-work').getBoundingClientRect();
    return r.top >= l.bottom - 2;
  }));
  check('the stage context still comes first', await page.evaluate(() => {
    const l = document.querySelector('.bw-ls-context').getBoundingClientRect();
    const r = document.querySelector('.bw-ls-work').getBoundingClientRect();
    return l.top < r.top;
  }));
  check('all five mini nodes survive', await page.locator('.bw-mini-item').count() === 5);
  check('and the strip is still on screen, not squeezed away', await page.evaluate(() => {
    const r = document.querySelector('.bw-mini-list').getBoundingClientRect();
    return r.width > 200 && r.height > 20;
  }));
  check('the back affordance survives too', await page.locator('#bw-to-map').isVisible());
  check('the lesson does not need horizontal page scrolling', await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
  await ctx.close();
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
