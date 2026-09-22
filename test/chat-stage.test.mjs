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
  version: 2,
  problem: 'Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.',
  steps: [{ action: 'Pull the delivery numbers', tools: 'Tableau' },
          { action: 'Draft each client update', tools: 'Word' }],
  toolsAll: ['Tableau', 'Word'],
  masterPromptV1: '', masterPromptV2: '', v2Source: '',
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
  check('the within-stage checklist is there',
    await page.locator('.bw-focus-step').count() === 3);
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
  check('the handoff card appears once it does',
    await page.locator('[data-card="next-step"]').count() === 1);
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
