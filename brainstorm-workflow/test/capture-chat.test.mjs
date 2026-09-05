/*
 * The two chats that take the workflow down instead of asking an opinion:
 * block 3 turns however the learner describes their process into a numbered
 * list, block 4 pins a tool to each number. Everything downstream is built
 * from that array, so what matters here is that speech in the wild - run-on
 * sentences, tidy lists, corrections after the fact - all land in it.
 */
import http from 'node:http';
import { withConfig, makeReporter, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('capture chats');
const check = report.check;

const doc = role => withConfig({ blockRole: `"${role}"` })
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const BLOCKS = [
  ['problem', 'problem'], ['steps', 'coach-workflow'],
  ['tools', 'coach-tools'], ['draft', 'draft']
];
const lesson = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
${BLOCKS.map(([id, r]) =>
  `<p>Rise content.</p><iframe id="${id}" style="width:900px;height:820px;border:0" srcdoc="${doc(r)}"></iframe>`)
  .join('\n')}</body></html>`;

const server = await new Promise(r => {
  const s = http.createServer((rq, rs) => {
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(lesson);
  });
  s.listen(8147, () => r(s));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
report.watch(page);

const F = id => page.frameLocator('#' + id);
const settle = (ms = 800) => page.waitForTimeout(ms);
const bots = (id, n) => page.waitForFunction(
  ([fid, k]) => document.querySelector('#' + fid).contentDocument
    .querySelectorAll('.bw-msg-bot:not([data-typing])').length >= k, [id, n], { timeout: 12000 });
const lastBot = id => F(id).locator('.bw-msg-bot').last().textContent();
let turns = { steps: 0, tools: 0 };
const say = async (id, text) => {
  await F(id).locator('#bw-chat-input').fill(text);
  await F(id).locator('#bw-chat-send').click();
  await bots(id, ++turns[id]);
  return lastBot(id);
};
// The steps array as stored, read from whichever block wrote it last.
const stored = () => page.evaluate(() => JSON.parse(
  document.querySelector('#steps').contentWindow.localStorage
    .getItem('brainstorm_workflow_data') || '{}'));
/* The activity's own Start over, not a storage wipe - a reload would fire the
   save-on-exit flush and write everything straight back. */
const restart = async () => {
  await F('problem').locator('#bw-reset').click();
  await F('problem').locator('#bw-reset').click();
  await settle(1600);
  turns = { steps: 0, tools: 0 };
};
const nameTask = async () => {
  await F('problem').locator('#bw-problem').fill(
    'Every Monday I rebuild eleven client status decks by hand and it eats the whole morning.');
  await F('problem').locator('[data-next="1"]').click();
  await settle(1400);
};

try {
  await page.goto('http://127.0.0.1:8147/');
  await settle(1200);

  // ---------------------------------------------------------------- gating
  check('the workflow chat waits on the task being named',
    !(await F('steps').locator('#bw-chat-wrap').isVisible()) &&
    (await F('steps').locator('#bw-prereq-2').textContent()).includes('Name the task'));
  check('the tools chat waits on the steps being mapped',
    !(await F('tools').locator('#bw-chat-wrap').isVisible()) &&
    (await F('tools').locator('#bw-prereq-2').textContent()).includes('Walk the coach through'));
  check('neither capture chat shows the card form',
    !(await F('steps').locator('#bw-workflow-wrap').isVisible()) &&
    !(await F('tools').locator('#bw-workflow-wrap').isVisible()));
  check('the chat lives inside step 2, not step 4', await page.evaluate(() =>
    document.querySelector('#steps').contentDocument
      .querySelector('#bw-panel-2 #bw-chat-wrap') !== null));
  check('each capture chat has its own heading',
    (await F('steps').locator('#bw-head-2 .bw-h2').textContent()).includes('Walk me through') &&
    (await F('tools').locator('#bw-head-2 .bw-h2').textContent()).includes('Where does each step'));

  await nameTask();
  await bots('steps', 1); turns.steps = 1;
  check('the workflow chat opens once the task is named',
    await F('steps').locator('#bw-chat-wrap').isVisible());
  check('its opening quotes the task they named',
    (await lastBot('steps')).includes('Every Monday'));

  // ------------------------------------------------- prose, said out loud
  let r = await say('steps',
    'I pull the numbers off Tableau, then I draft each account update, then reformat the whole thing into the deck');
  check('a run-on sentence becomes a numbered list',
    /1\. Pull the numbers off Tableau/.test(r) && /2\. Draft each account update/.test(r) &&
    /3\. Reformat the whole thing into the deck/.test(r), r.slice(0, 240));
  check('it asks them to check it before moving on', /Look right\?/.test(r));
  check('"I" is stripped so the list reads as instructions', !/1\. I pull/.test(r));
  let data = await stored();
  check('three steps are stored', data.steps.filter(s => s.action).length === 3,
    JSON.stringify(data.steps));

  // ------------------------------------------------------- correcting one
  r = await say('steps', 'step 2 should be draft each update from the CRM notes');
  check('a numbered correction rewrites that step only',
    /2\. Draft each update from the CRM notes/.test(r) && /1\. Pull the numbers off Tableau/.test(r),
    r.slice(0, 240));
  check('correcting does not drop the others',
    (await stored()).steps.filter(s => s.action).length === 3);

  // --------------------------------------------------------- adding later
  r = await say('steps', 'oh and then I email it to the account leads');
  check('one extra step is appended, not swapped in',
    /4\. Email it to the account leads/.test(r) && /1\. Pull the numbers off Tableau/.test(r),
    r.slice(0, 240));

  // -------------------------------------------------------- nothing usable
  r = await say('steps', 'no');
  check('an unusable answer is asked again, not stored',
    /didn'?t catch any steps/i.test(r), r.slice(0, 160));
  check('the list survives the unusable answer',
    (await stored()).steps.filter(s => s.action).length === 4);

  // -------------------------------------------------------------- confirm
  r = await say('steps', 'yes that looks right');
  check('confirming closes the chat out', /Locked in/.test(r), r.slice(0, 160));
  check('confirming is not itself filed as a step',
    (await stored()).steps.filter(s => s.action).length === 4,
    JSON.stringify((await stored()).steps));

  // ----------------------------------------------------- tools, downstream
  await settle(1400);
  await bots('tools', 1); turns.tools = 1;
  check('the tools chat unlocked itself',
    await F('tools').locator('#bw-chat-wrap').isVisible());
  check('and it opens by reading back the list block 3 wrote',
    (await lastBot('tools')).includes('Email it to the account leads'));

  r = await say('tools', 'Tableau, Word, PowerPoint, Outlook');
  check('a bare list matching the step count zips in order',
    /1\..*Tableau/.test(r) && /2\..*Word/.test(r) && /4\..*Outlook/.test(r), r.slice(0, 280));
  data = await stored();
  check('tools are stored against their own steps',
    data.steps[0].tools === 'Tableau' && data.steps[3].tools === 'Outlook',
    JSON.stringify(data.steps));
  check('and roll up into the tools list',
    data.toolsAll.join(',') === 'Tableau,Word,PowerPoint,Outlook', String(data.toolsAll));

  r = await say('tools', '2 is Google Docs');
  check('one tool can be corrected by number',
    /2\..*Google Docs/.test(r) && /1\..*Tableau/.test(r), r.slice(0, 280));

  r = await say('tools', 'yep');
  check('confirming the tools closes it out', /that'?s your workflow and where it lives/i.test(r),
    r.slice(0, 160));

  await settle(1200);
  const v1 = await F('draft').locator('#bw-prompt-v1').textContent();
  check('the draft prompt is built from both chats',
    v1.includes('Pull the numbers off Tableau') && v1.includes('Google Docs'), v1.slice(0, 300));

  // ------------------------------------------- a mismatch is asked, not guessed
  await restart();
  await nameTask();
  await bots('steps', 1); turns.steps = 1;
  await say('steps', '1. Pull the numbers\n2. Draft the update\n3. Reformat the deck');
  check('a typed numbered list is taken as written',
    (await stored()).steps.map(s => s.action).join('|') ===
      'Pull the numbers|Draft the update|Reformat the deck',
    JSON.stringify((await stored()).steps));
  await settle(1400);
  await bots('tools', 1); turns.tools = 1;

  r = await say('tools', 'Excel and Word');
  check('two tools for three steps is asked about, not guessed',
    /2 tools/.test(r) && /Give me one per number/.test(r), r.slice(0, 260));
  data = await stored();
  check('and nothing was written on the guess',
    data.steps.every(s => !s.tools), JSON.stringify(data.steps));

  r = await say('tools', 'Excel and Word');
  check('a second mismatch is matched in order and flagged as a guess',
    /matched them up in the order/.test(r) && /Some of that is a guess/.test(r), r.slice(0, 280));

  r = await say('tools', 'it is all in Excel actually');
  check('naming one place puts it on every step',
    /1\..*Excel/.test(r) && /2\..*Excel/.test(r) && /3\..*Excel/.test(r), r.slice(0, 280));

  // ---------------------------------------------- one step is not a workflow
  await restart();
  await nameTask();
  await bots('steps', 1); turns.steps = 1;
  r = await say('steps', 'I rebuild the deck');
  check('a single step is pushed on rather than accepted',
    /one step isn'?t a workflow/i.test(r), r.slice(0, 200));
  r = await say('steps', 'before that I export the numbers');
  check('a step remembered late goes where they said it goes',
    /1\. Export the numbers/.test(r) && /2\. Rebuild the deck/.test(r), r.slice(0, 240));

  // ------------------------------------------------------ restart is local
  await F('steps').locator('#bw-chat-restart').click();
  await F('steps').locator('#bw-chat-restart').click();
  await settle(1200);
  data = await stored();
  check('restarting the workflow chat clears the steps it took down',
    data.steps.every(s => !s.action), JSON.stringify(data.steps));
  check('and the problem above it is untouched', String(data.problem).includes('Every Monday'));
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
