/*
 * Deploy: a guided review of one finished artifact.
 *
 * The stage answers three learner jobs in order - understand what was built,
 * inspect what still needs attention, leave with something they know how to
 * use - and the order is the design. Every check here is a consequence of
 * refusing to make it a six-field editor.
 *
 * Read before reveal. The artifact used to be the first thing on screen, with
 * no beat explaining that it is the learner's own decisions rather than
 * something a model invented for them.
 *
 * Provenance without a second artifact UI. Six rows above the prompt saying
 * which stages each section came from. The headings must be the ones the
 * generator actually emits: a map that has drifted is worse than no map, so
 * it is checked against the real output rather than trusted.
 *
 * Ownership is asked for, not inferred. The prompt is read-only until the
 * learner presses Edit, and the pen only changes hands on the first real
 * divergence - opening edit mode to read more closely costs nothing. Once it
 * has changed hands, nothing here grades their prose: the only honest signal
 * left is whether [NEEDS DETAIL] markers still stand in the text.
 *
 * And finishing is a learning state, not a clipboard event. Copy used to be
 * the only thing that ticked stage 5, so a learner who took the Ctrl+C
 * fallback the copy button itself offers ended the journey at four of five.
 */
import { serveSite, makeReporter, loadChromium, readLesson, seedState, readActivity }
  from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('deploy stage');
const check = report.check;

const PORT = 8176;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const DONE_ANSWERS = {
  handoff: 'Steps 1 and 3 — pull the numbers and draft the routine paragraphs of each update.',
  output: 'Four short paragraphs per client, under 200 words, no bullets, direct with no hedging.',
  keep: 'The judgement about what to flag next week, and the final read before it goes out.',
  context: 'Never invent a figure that is not in the export. Client names match the roster.',
  notes: []
};
const SETTLED = { handoff: true, keep: true, output: true, context: true };

let ctx, page;
/* Opens Deploy. `reading: true` stops on the lesson instead of walking past it. */
async function openDeploy(opts = {}) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  page = await ctx.newPage();
  report.watch(page);
  const seed = seedState({
    botAnswers: { ...DONE_ANSWERS, ...(opts.answers || {}) },
    decided: SETTLED,
    pushedBack: opts.pushedBack || {},
    progress: { current: 5, unlocked: 5, done: { 1: true, 2: true, 3: true, 4: true },
                entered: { 1: true, 2: true, 3: true, 4: true } },
    ...(opts.seed || {})
  });
  await page.addInitScript(s => {
    localStorage.setItem('bw_started', '1');
    if (!localStorage.getItem('brainstorm_workflow_data')) {
      localStorage.setItem('brainstorm_workflow_data', s);
    }
  }, JSON.stringify(seed));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);
  await page.click('.bw-station[data-stage="5"] .bw-station-card');
  await page.waitForTimeout(700);
  if (!opts.reading) await readLesson(page);
}

const stored = async () => {
  await page.waitForTimeout(400);
  return page.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data')));
};
const readOnly = () => page.locator('#bw-prompt-v2').evaluate(n => n.readOnly);
const visible = sel => page.locator(sel).isVisible();

try {
  // ==================== it teaches before it reveals ====================
  await openDeploy({ reading: true });
  check('Deploy opens on a reading, not on the artifact',
    await visible('#bw-lesson-body') && !(await visible('#bw-prompt-v2')));
  check('titled for what it asks them to do first',
    (await page.locator('#bw-lesson-title').textContent()) === 'Review before you run it',
    await page.locator('#bw-lesson-title').textContent());
  const lesson = await page.locator('#bw-lesson-copy').textContent();
  check('it says the prompt is their own decisions, not the model\'s invention',
    /decisions you made across the journey/i.test(lesson) && /not from a blank page/i.test(lesson),
    lesson.slice(0, 140));
  /* The paragraph that has to survive any rewrite: a learner who reads a marker
     as a broken result will either stop or paper over it. */
  check('and that a marked gap is handled, not a failure',
    /isn't broken/i.test(lesson) && /stop and ask/i.test(lesson), lesson.slice(0, 400));
  check('no provenance map or artifact behind the reading',
    !(await visible('#bw-prov')) && !(await visible('#bw-final-wrap')));

  await readLesson(page);
  check('continue reveals the artifact', await visible('#bw-prompt-v2'));

  // ==================== where each section came from ====================
  const rows = await page.locator('#bw-prov-list .bw-prov-name').allTextContents();
  const froms = await page.locator('#bw-prov-list .bw-prov-from').allTextContents();
  check('six rows, one per section', rows.length === 6 && froms.length === 6,
    rows.length + '/' + froms.length);

  /* The map has to describe the prompt, not an idealisation of it. Compared
     against the headings the generator really emits, in order. */
  const heads = (await page.locator('#bw-prompt-v2').inputValue())
    .match(/^## (.+)$/gm).map(h => h.replace('## ', ''));
  check('and they are the artifact\'s own headings, in its own order',
    rows.join('|') === heads.join('|'), rows.join('|') + '  vs  ' + heads.join('|'));

  check('each row names the stages it came from',
    froms.every(f => /^From |^Builder safeguards/.test(f)), JSON.stringify(froms));
  check('the Refine decisions are named the way the rail named them',
    froms.join(' ').includes('What AI handles') &&
    froms.join(' ').includes('What stays yours') &&
    froms.join(' ').includes('What good looks like') &&
    froms.join(' ').includes('What AI needs to know'), froms.join(' | '));
  /* The safety claim in the lesson is only credible because it is in the
     artifact. This row is where a skeptical learner goes to check. */
  check('and the last row points at where the stop-and-ask instruction lives',
    /stop and ask/i.test(froms[5]), froms[5]);
  check('it is a map, not a second editor',
    await page.locator('#bw-prov textarea, #bw-prov input').count() === 0);

  // ==================== read first, edit on request ====================
  check('the artifact is read-only to begin with', await readOnly());
  check('copy leads, edit follows',
    await visible('#bw-copy-final') && await visible('#bw-edit-final'));
  check('and rebuild is not offered when there is nothing to rebuild from',
    !(await visible('#bw-regen-v2')));
  check('with no editing-state note yet', !(await visible('#bw-v2-state')));

  await page.click('#bw-edit-final');
  await page.waitForTimeout(250);
  check('Edit opens the field', !(await readOnly()));
  check('and says so, without claiming they have changed anything',
    (await page.locator('#bw-v2-state').textContent())
      .includes('unchanged until you make an edit'),
    await page.locator('#bw-v2-state').textContent());
  check('opening edit mode alone does not take ownership',
    (await stored()).v2Source !== 'user', (await stored()).v2Source);
  check('so rebuild is still not on offer', !(await visible('#bw-regen-v2')));

  await page.locator('#bw-prompt-v2').focus();
  await page.keyboard.type(' one more rule.');
  await page.waitForTimeout(400);
  check('the first real change hands over the pen',
    (await stored()).v2Source === 'user', (await stored()).v2Source);
  check('and the note changes to say what that costs',
    (await page.locator('#bw-v2-state').textContent())
      .includes('Rebuilding from your decisions will replace these edits'),
    await page.locator('#bw-v2-state').textContent());
  check('rebuild appears now that there are edits to lose',
    await visible('#bw-regen-v2'));

  // ==================== rebuilding hands the pen back ====================
  await page.click('#bw-regen-v2');
  await page.click('#bw-regen-v2');            // inline confirm
  await page.waitForTimeout(400);
  check('rebuild restores the generated artifact',
    !(await page.locator('#bw-prompt-v2').inputValue()).includes('one more rule'));
  check('and returns it to read-only', await readOnly());
  check('with rebuild put away again', !(await visible('#bw-regen-v2')));

  // ==================== what still needs attention ====================
  /* A thin answer that was accepted on the second pass: the artifact carries a
     [NEEDS DETAIL] marker, and Deploy has to say so without making the result
     feel broken. */
  await openDeploy({ answers: { keep: 'meh' }, pushedBack: { keep: true } });
  check('a thin section is flagged outside the artifact',
    await visible('#bw-v2-detail'));
  const detail = await page.locator('#bw-v2-detail').textContent();
  check('naming the section, and agreeing in number',
    detail.includes('One part still needs detail.') &&
    detail.includes('WHAT STAYS WITH ME is still vague') &&
    detail.includes('tighten it here'), detail);
  check('and offering the prompt as usable rather than broken',
    /use the prompt as-is/i.test(detail) && /stop and ask/i.test(detail), detail);
  check('the marker is in the artifact too, where the assistant will read it',
    (await page.locator('#bw-prompt-v2').inputValue()).includes('[NEEDS DETAIL'));
  /* The old paintV2 returned early on this notice, so a learner with a vague
     section was told what was wrong and never told where the thing came from. */
  check('and the provenance map is still shown alongside it',
    await visible('#bw-prov') &&
    await page.locator('#bw-prov-list .bw-prov-name').count() === 6);

  // ---- once they own it, the upstream answers stop being authoritative ----
  await page.click('#bw-edit-final');
  await page.locator('#bw-prompt-v2').focus();
  await page.keyboard.type(' ');
  await page.waitForTimeout(400);
  check('after they take the pen the notice stops citing botAnswers',
    !(await page.locator('#bw-v2-detail').textContent()).includes('still vague'),
    await page.locator('#bw-v2-detail').textContent());
  check('and reports what the text itself still says',
    (await page.locator('#bw-v2-detail').textContent())
      .includes('still has parts marked [NEEDS DETAIL]'),
    await page.locator('#bw-v2-detail').textContent());

  /* Delete the marker without adding detail and the warning goes. They took the
     pen; the application does not understand their prose well enough to grade
     it, and pretending otherwise would be the six-field editor by other means. */
  await page.locator('#bw-prompt-v2').fill(
    (await page.locator('#bw-prompt-v2').inputValue()).replace(/\[NEEDS DETAIL[^\]]*\]/g, ''));
  await page.waitForTimeout(400);
  check('removing the marker is accepted as their call',
    !(await visible('#bw-v2-detail')));

  // A clean set of answers earns no notice at all.
  await openDeploy();
  check('nothing to flag on a prompt with no thin sections',
    !(await visible('#bw-v2-detail')));

  // ==================== copying is not finishing ====================
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  check('the journey is not complete on arrival',
    (await page.locator('#bw-progress-label').textContent()) !== 'Complete',
    await page.locator('#bw-progress-label').textContent());
  await page.click('#bw-copy-final');
  await page.waitForTimeout(400);
  check('copy confirms', (await page.locator('#bw-copy-status').textContent()).includes('Copied'));
  check('but copying does not finish the journey',
    (await stored()).progress.done['5'] !== true,
    JSON.stringify((await stored()).progress.done));
  check('and the map still shows Deploy unfinished', await page.evaluate(async () => {
    document.getElementById('bw-to-map').click();
    await new Promise(r => setTimeout(r, 600));
    return document.querySelector('.bw-station[data-stage="5"]').dataset.state !== 'completed';
  }));

  await page.click('.bw-station[data-stage="5"] .bw-station-card');
  await page.waitForTimeout(700);
  await readLesson(page);
  check('the use guidance comes before the finish',
    await page.evaluate(() => {
      const use = document.querySelector('#bw-panel-5 .bw-outcome').getBoundingClientRect();
      const fin = document.getElementById('bw-finish-row').getBoundingClientRect();
      return fin.top >= use.bottom - 2;
    }));
  const useCopy = (await page.locator('#bw-panel-5 .bw-outcome').textContent())
    .replace(/\s+/g, ' ').trim();
  check('and it tells them to run it on real work and fold the correction back',
    /run it on a real version of the task/i.test(useCopy) &&
    /fold that correction back into the reusable prompt/i.test(useCopy), useCopy.slice(0, 120));

  await page.click('#bw-finish');
  await page.waitForTimeout(500);
  check('finishing is what completes the journey',
    (await stored()).progress.done['5'] === true,
    JSON.stringify((await stored()).progress.done));
  check('the label agrees',
    (await page.locator('#bw-progress-label').textContent()) === 'Complete',
    await page.locator('#bw-progress-label').textContent());
  check('and the button stops offering what has been done',
    (await page.locator('#bw-finish').textContent()) === 'Journey complete' &&
    await page.locator('#bw-finish').isDisabled());

  await page.reload();
  await page.waitForTimeout(500);
  await page.click('.bw-station[data-stage="5"] .bw-station-card');
  await page.waitForTimeout(700);
  await readLesson(page);
  check('which survives a reload',
    (await page.locator('#bw-finish').textContent()) === 'Journey complete' &&
    await page.locator('#bw-finish').isDisabled());
  check('with every station complete', await page.evaluate(async () => {
    document.getElementById('bw-to-map').click();
    await new Promise(r => setTimeout(r, 600));
    return [...document.querySelectorAll('.bw-station')]
      .every(e => e.dataset.state === 'completed');
  }));

  // ==================== the preview route ====================
  /* /role/artifact previews the whole of Deploy except finishing a journey it
     is not part of. */
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  page = await ctx.newPage();
  report.watch(page);
  /* Seeded past the gate: an unfilled artifact slice hides its own body behind
     a prereq notice, which is a different rule and not what this checks. */
  await page.addInitScript(x => {
    localStorage.setItem('brainstorm_workflow_data', x);
  }, JSON.stringify(seedState({
    botAnswers: DONE_ANSWERS, decided: SETTLED,
    progress: { current: 5, unlocked: 5, done: { 1: true, 2: true, 3: true, 4: true },
                entered: { 1: true, 2: true, 3: true, 4: true } }
  })));
  await page.goto(`http://127.0.0.1:${PORT}/role/artifact`);
  await page.waitForTimeout(700);
  check('the artifact slice still shows the prompt and its provenance',
    await visible('#bw-prompt-v2') &&
    await page.locator('#bw-prov-list .bw-prov-name').count() === 6);
  check('and the read-first controls', await readOnly() && await visible('#bw-edit-final'));
  check('but not a journey it cannot finish', !(await visible('#bw-finish')));

  // ==================== the copy is where it is meant to be ====================
  const src = readActivity();
  const sectionTable = src.slice(src.indexOf('var PROMPT_SECTIONS = ['),
                                 src.indexOf('var SECTION_LABELS'));
  check('the section map is data, not six sentences written out by hand',
    sectionTable.length > 0 && (sectionTable.match(/head: "/g) || []).length === 6,
    String((sectionTable.match(/head: "/g) || []).length));
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
