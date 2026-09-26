/*
 * Admin mode: the review harness behind ?admin=1.
 *
 * The thing worth pinning is not that the buttons work - it is that they
 * cannot lie. Admin mode writes through the same functions a learner's clicks
 * reach, so every state it produces is a state the real flow could produce. A
 * bug you can only see in admin mode is a bug in admin mode, which is worth
 * nothing. So most of what follows checks that what the bar leaves behind is
 * indistinguishable from what answering the activity honestly leaves behind.
 *
 * The other half is containment: off by default, and invisible to a learner.
 */
import { serveSite, makeReporter, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('admin mode');
const check = report.check;

const PORT = 8161;
const server = await serveSite(PORT);
const browser = await chromium.launch();
const BASE = `http://127.0.0.1:${PORT}/`;

let ctx, page;
async function open(path = '?admin=1') {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  page = await ctx.newPage();
  report.watch(page);
  await page.goto(BASE + path);
  await page.waitForTimeout(400);
}

const bar = () => page.locator('#bw-admin');
const jump = n => page.locator(`.bw-admin-jump [data-goto="${n}"]`);
const jumpStates = () => page.locator('.bw-admin-jump [data-goto]')
  .evaluateAll(els => els.map(e => e.dataset.state).join(','));
const mapStates = () => page.locator('.bw-station')
  .evaluateAll(els => els.map(e => e.dataset.state).join(','));
const where = () => page.locator('.bw-admin-where').textContent();
const btn = label => page.locator(`#bw-admin button:text-is("${label}")`);
const stored = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem('brainstorm_workflow_data') || '{}'));

try {
  // ======================= off unless asked for =======================
  await open('');
  check('no admin bar on the plain URL', await bar().count() === 0);
  check('and nothing marks the page as admin',
    await page.locator('.bw[data-admin]').count() === 0);

  await open('?admin=0');
  check('and not for a falsy flag', await bar().count() === 0);

  await open('?adminx=1');
  check('nor for a merely similar one', await bar().count() === 0);

  await open('?x=1&admin=1');
  check('but yes when it is not the first parameter', await bar().isVisible());

  // ============================ the bar ============================
  await open();
  check('the bar is on screen', await bar().isVisible());
  check('and says so unmistakably',
    (await page.locator('.bw-admin-tag').textContent()) === 'ADMIN');
  check('it is fixed, so it cannot shift the layout it exists to show',
    await page.evaluate(() => getComputedStyle(document.querySelector('#bw-admin')).position) === 'fixed');
  check('it reads out where you are', (await where()) === 'landing', await where());
  check('the jump row shows real state, not its own',
    (await jumpStates()) === 'available,locked,locked,locked,locked', await jumpStates());

  // ===================== jumping unlocks honestly =====================
  await jump(3).click();
  await page.waitForTimeout(700);
  check('jumping opens the stage', (await where()).startsWith('stage 3'), await where());
  check('and unlocks up to it, no further', (await stored()).progress.unlocked === 3,
    String((await stored()).progress.unlocked));
  check('a jumped-to stage is entered, so it reads as current',
    (await jumpStates()).split(',')[2] === 'current', await jumpStates());
  check('and the stage beyond it is still locked',
    (await jumpStates()).split(',')[3] === 'locked');

  // ==================== the phase toggle ====================
  await jump(2).click();
  await page.waitForTimeout(700);
  check('the phase toggle is dead on a stage with no coach',
    await page.locator('[data-phase-toggle]').isDisabled());
  await jump(1).click();
  await page.waitForTimeout(700);
  check('stage 1 opens on its lesson', await page.locator('#bw-lesson-body').isVisible());
  check('and the toggle is live there',
    !(await page.locator('[data-phase-toggle]').isDisabled()));
  await page.locator('[data-phase-toggle]').click();
  await page.waitForTimeout(800);
  check('it switches to the coach', await page.locator('#bw-chat-panel').isVisible());
  check('and the read-out follows', (await where()).endsWith('chat'), await where());
  await page.locator('[data-phase-toggle]').click();
  await page.waitForTimeout(800);
  check('and back to the lesson', await page.locator('#bw-lesson-body').isVisible());

  // =========== skip goes through the real gate, not around it ===========
  await open();
  await jump(1).click();
  await page.waitForTimeout(700);
  check('stage 1 starts unanswered', !((await stored()).problem || '').length);
  await btn('Skip →').click();
  await page.waitForTimeout(900);
  check('skip fills the stage', ((await stored()).problem || '').length > 40);
  check('and advances', (await where()).startsWith('stage 2'), await where());
  check('marking stage 1 done the way goNext does',
    (await stored()).progress.done['1'] === true);
  check('the transcript it seeded is a real conversation',
    (await stored()).conversations.identify.filter(m => m.role === 'user').length >= 2,
    String((await stored()).conversations.identify.length));
  check('and the textarea behind the lesson agrees with it',
    (await page.evaluate(() => document.querySelector('#bw-problem').value)) ===
    (await stored()).problem);

  await btn('Skip →').click();
  await page.waitForTimeout(900);
  check('skip reads past a reading-only stage', (await where()).startsWith('stage 3'),
    await where());
  await btn('Skip →').click();
  await page.waitForTimeout(900);
  check('skip works on the builder stage too', (await where()).startsWith('stage 4'),
    await where());
  check('with four real steps', (await stored()).steps.filter(s => s.action).length === 4,
    String((await stored()).steps.length));
  check('and tools recomputed from them, not stored twice',
    (await stored()).toolsAll.join(',') === 'Asana,Harvest,Gmail,Google Docs,Slack',
    (await stored()).toolsAll.join(','));

  // ==================== fill all ====================
  await open();
  await btn('Fill all').click();
  await page.waitForTimeout(1400);
  check('fill all completes the journey',
    (await jumpStates()) === 'completed,completed,completed,completed,current',
    await jumpStates());
  await btn('Map').click();
  await page.waitForTimeout(700);
  check('the journey map agrees with the jump row',
    (await mapStates()) === (await jumpStates()),
    (await mapStates()) + ' vs ' + (await jumpStates()));
  check('completion lines are the real computed ones, not admin text',
    (await page.locator('.bw-station[data-stage="3"] .bw-card-status').textContent())
      === 'Complete · 4 steps mapped',
    await page.locator('.bw-station[data-stage="3"] .bw-card-status').textContent());

  // ============ the artifact it leaves behind is the real one ============
  await jump(5).click();
  await page.waitForTimeout(800);
  const v2 = await page.locator('#bw-prompt-v2').inputValue();
  check('stage 5 holds a finished prompt', v2.startsWith('## CONTEXT'), v2.slice(0, 40));
  check('carrying every section',
    ['## CONTEXT', '## WHAT I NEED YOU TO DO', '## WHAT STAYS WITH ME',
     '## OUTPUT I EXPECT', '## THINGS YOU NEED TO KNOW'].every(h => v2.includes(h)));
  check('built from the sample answers', v2.includes('under 200 words'), v2.slice(0, 120));
  check('with no fence markers left in it', !v2.includes('```'));
  check('and credited to the coach, which is the path a learner takes',
    (await stored()).v2Source === 'bot', (await stored()).v2Source);
  check('no placeholder survived', !/\[Name the steps|\[Format, length|\[Facts, constraints/.test(v2));

  // ==================== clear ====================
  await btn('Clear').click();
  await page.waitForTimeout(800);
  check('clear returns to the landing', await page.locator('#bw-landing').isVisible());
  check('and relocks everything',
    (await jumpStates()) === 'available,locked,locked,locked,locked', await jumpStates());
  check('with the saved data gone', !((await stored()).problem || '').length);

  // ==================== the /admin/ door ====================
  await open('admin/');
  check('/admin/ resolves rather than 404ing',
    !(await page.content()).includes('not found'));
  check('and lands on the activity with the bar up', await bar().isVisible());
  check('having rewritten the URL to the flag the app actually reads',
    page.url().includes('admin=1'), page.url());

  // ==================== containment ====================
  await open();
  check('admin mode changes nothing about the activity itself', await page.evaluate(() => {
    const strays = document.querySelectorAll('.bw [class*="bw-admin"]');
    return strays.length === 0;          // the bar is a sibling of .bw, not inside it
  }));
  await open('');
  check('and a learner reloading a page it touched sees no trace of it',
    await bar().count() === 0 && await page.locator('.bw-admin-tag').count() === 0);
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
