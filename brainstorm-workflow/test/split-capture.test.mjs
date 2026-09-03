/*
 * The capture form split across three Rise blocks: name the task, map the
 * workflow, see the draft. Each waits on the ones above it, and unlocks itself
 * when they are filled in - the same contract the chat blocks already have.
 */
import http from 'node:http';
import { withConfig, makeReporter, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('split capture');
const check = report.check;

const doc = role => withConfig({ blockRole: `"${role}"` })
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const lesson = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
${[['intro', 'intro'], ['problem', 'problem'], ['workflow', 'workflow'], ['draft', 'draft'], ['artifact', 'artifact']]
  .map(([id, r]) => `<p>Rise content.</p><iframe id="${id}" style="width:900px;height:760px;border:0" srcdoc="${doc(r)}"></iframe>`)
  .join('\n')}</body></html>`;

const server = await new Promise(r => {
  const s = http.createServer((rq, rs) => {
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(lesson);
  });
  s.listen(8146, () => r(s));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
report.watch(page);
const F = id => page.frameLocator('#' + id);
const settle = (ms = 900) => page.waitForTimeout(ms);

try {
  await page.goto('http://127.0.0.1:8146/');
  await settle(1000);

  // ---- each block renders one step ----
  const visible = async id => {
    const out = [];
    for (let n = 1; n <= 5; n++) if (await F(id).locator(`.bw-step[data-step="${n}"]`).isVisible()) out.push(n);
    return out.join(',');
  };
  check('block 1 renders only step 1', await visible('problem') === '1', await visible('problem'));
  check('block 2 renders only step 2', await visible('workflow') === '2', await visible('workflow'));
  check('block 3 renders only step 3', await visible('draft') === '3', await visible('draft'));
  // ---- the intro block is framing only ----
  check('intro block shows the hero', await F('intro').locator('.bw-hero').isVisible());
  check('intro block shows the worked example', await F('intro').locator('.bw-example').isVisible());
  check('intro block renders no steps', await visible('intro') === '', await visible('intro'));
  check('intro block hides the progress rail', !(await F('intro').locator('.bw-progress').isVisible()));
  check('intro block hides the footer', !(await F('intro').locator('.bw-foot').isVisible()));
  check('the problem block no longer repeats the hero',
    !(await F('problem').locator('.bw-hero').isVisible()));
  check('the workflow block has no hero either', !(await F('workflow').locator('.bw-hero').isVisible()));

  // ---- the minimum is 25 characters, and reads as a floor ----
  check('counter states what is still needed',
    (await F('problem').locator('#bw-problem-count').textContent()).includes('25 more characters'),
    await F('problem').locator('#bw-problem-count').textContent());
  await F('problem').locator('#bw-problem').fill('Weekly status updates, two hours');  // 32 chars
  await settle(400);
  check('32 characters clears the 25 minimum', await F('problem').locator('[data-next="1"]').isEnabled());
  await F('problem').locator('[data-next="1"]').click();
  await settle(300);
  check('a 32-character problem is accepted', await F('problem').locator('#bw-warn-1').isHidden());

  // ---- downstream blocks start gated ----
  await F('problem').locator('#bw-problem').fill('');
  await settle();
  check('block 2 gates until the task is named', await F('workflow').locator('#bw-prereq-2').isVisible());
  check('block 2 hides its cards while gated', !(await F('workflow').locator('#bw-workflow-wrap').isVisible()));
  check('block 2 cannot advance while gated', await F('workflow').locator('[data-next="2"]').isDisabled());
  check('block 3 gates too', await F('draft').locator('#bw-prereq-3').isVisible());
  check('block 3 hides the draft while gated', !(await F('draft').locator('#bw-draft-wrap').isVisible()));

  // ---- naming the task unlocks block 2 only ----
  await F('problem').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand and it costs me two hours.');
  await F('problem').locator('[data-next="1"]').click();
  await settle(1400);
  check('block 2 unlocks once the task is named', !(await F('workflow').locator('#bw-prereq-2').isVisible()));
  check('block 2 shows its cards', await F('workflow').locator('#bw-workflow-wrap').isVisible());
  check('block 3 still waits on the workflow', await F('draft').locator('#bw-prereq-3').isVisible());

  // ---- mapping the workflow unlocks block 3 ----
  const cards = F('workflow').locator('#bw-cards .bw-card');
  await cards.nth(0).locator('input').nth(0).fill('Pull the delivery numbers');
  await cards.nth(0).locator('input').nth(1).fill('Asana');
  await cards.nth(1).locator('input').nth(0).fill('Draft each update');
  await cards.nth(1).locator('input').nth(1).fill('Google Docs');
  await F('workflow').locator('[data-next="2"]').click();
  await settle(1500);
  check('block 3 unlocks once the workflow is mapped', !(await F('draft').locator('#bw-prereq-3').isVisible()));
  const draft = await F('draft').locator('#bw-prompt-v1').textContent();
  check('the draft carries the problem from block 1', draft.includes('costs me two hours'), draft.slice(0, 90));
  check('the draft carries the steps from block 2', draft.includes('Asana') && draft.includes('Google Docs'));

  // ---- hand-off notes rather than opening a step it does not own ----
  check('block 2 shows a hand-off note', await F('workflow').locator('#bw-handoff').isVisible());

  // ---- ownership: editing one block must not wipe the other ----
  await F('workflow').locator('#bw-cards .bw-card').nth(0).locator('input').nth(0).fill('Pull the weekly numbers');
  await settle();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data')));
  check('editing the workflow keeps the problem', saved.problem.includes('costs me two hours'));
  await F('problem').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status updates by hand, and it eats two hours of my week.');
  await settle();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('brainstorm_workflow_data')));
  check('editing the problem keeps the workflow',
    saved.steps.length === 2 && saved.steps[0].action === 'Pull the weekly numbers');
  check('and the artifact block saw all of it',
    (await F('artifact').locator('#bw-prompt-v2').inputValue()).includes('eats two hours'));
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
