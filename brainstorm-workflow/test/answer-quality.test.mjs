/*
 * The three defects persona testing found, and their fixes:
 *   1. a prompt built from vague answers looked exactly as finished as a good one
 *   2. contradictory answers passed straight through unreconciled
 *   3. conversational replies were pasted in verbatim as instructions
 * Each is checked here so it can't come back quietly.
 */
import { serveHtml, withConfig, makeReporter, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('answer quality');
const check = report.check;

const seed = extra => JSON.stringify(Object.assign({
  version: 2,
  problem: 'Every Monday I spend two hours building status updates for eleven clients by hand.',
  steps: [{ action: 'Pull delivery numbers', tools: 'Asana' },
          { action: 'Draft the update per client', tools: 'Google Docs' }],
  toolsAll: ['Asana', 'Google Docs'],
  masterPromptV1: '', masterPromptV2: '', v2Source: '',
  conversations: { all: [], handoff: [], standards: [], guardrails: [] },
  mockProgress: { all: 0, handoff: 0, standards: 0, guardrails: 0 },
  botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
  pushedBack: {},
  progress: { current: 1, unlocked: 3, done: { 1: true, 2: true, 3: true } }
}, extra));

const browser = await chromium.launch();
let server;

async function open(role, state) {
  if (server) server.close();
  server = await serveHtml(withConfig({ blockRole: `"${role}"` }), 8145);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  report.watch(page);
  await page.addInitScript(s => localStorage.setItem('brainstorm_workflow_data', s), state);
  await page.goto('http://127.0.0.1:8145/');
  await page.waitForTimeout(1100);
  return { ctx, page };
}

const stage = (page, st) => page.evaluate(s => {
  const d = JSON.parse(localStorage.getItem('brainstorm_workflow_data') || '{}');
  return (d.mockProgress || {})[s] || 0;
}, st);

async function say(page, text) {
  await page.locator('#bw-chat-input').fill(text);
  await page.locator('#bw-chat-send').click();
  await page.waitForTimeout(1600);
}

try {
  // ---- 1. a vague answer gets pushed back on, exactly once ----
  let { ctx, page } = await open('coach-handoff', seed());
  await page.waitForTimeout(400);
  await say(page, 'Probably the writing part. It just takes forever.');
  check('vague answer does not advance the stage', await stage(page, 'handoff') === 0);
  const push = await page.locator('.bw-msg-bot').last().textContent();
  check('the coach re-asks with something concrete',
    push.includes('numbered step') || push.includes('handed back'), push.slice(0, 110));
  check('the vague answer is still kept, not discarded', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('brainstorm_workflow_data')).botAnswers.handoff.length > 0));

  await say(page, 'Still no idea really.');
  check('a second vague answer is accepted, not looped', await stage(page, 'handoff') === 1);
  check('only one pushback per question', await page.locator('.bw-msg-user').count() === 2);
  const ack = await page.locator('.bw-msg-bot').last().textContent();
  check('the coach is honest about accepting a thin answer',
    ack.includes('needing detail'), ack.slice(0, 120));
  check('and does not praise it', !/that I can work with|right instinct/i.test(ack), ack.slice(0, 120));
  await ctx.close();

  // ---- 2. a specific answer is never pushed back on ----
  ({ ctx, page } = await open('coach-handoff', seed()));
  await page.waitForTimeout(400);
  await say(page, 'Step 2, drafting the update. I want a first draft I can edit, per client.');
  check('a specific answer advances immediately', await stage(page, 'handoff') === 1);
  check('no pushback for a good answer', await page.locator('.bw-msg-user').count() === 1);
  await ctx.close();

  // ---- 3. thin answers are marked, and the artifact says so ----
  ({ ctx, page } = await open('artifact', seed({
    botAnswers: { handoff: 'The writing part.', output: 'Just make it good.',
                  keep: 'I do not know really.', context: 'Nothing comes to mind.', notes: [] }
  })));
  const weakPrompt = await page.locator('#bw-prompt-v2').inputValue();
  check('thin sections are marked in the prompt',
    (weakPrompt.match(/\[NEEDS DETAIL/g) || []).length >= 3, weakPrompt.slice(0, 200));
  check('the prompt tells the assistant to ask about them',
    weakPrompt.includes('too vague to act on') && weakPrompt.includes('wait for my answers'));
  const notice = await page.locator('#bw-v2-source');
  check('the block warns it is not ready', (await notice.textContent()).includes("isn't ready yet"));
  check('the warning is styled as a warning',
    (await notice.getAttribute('class')).includes('bw-notice-warn'));
  await ctx.close();

  // ---- 4. good answers produce no markers and no warning ----
  ({ ctx, page } = await open('artifact', seed({
    botAnswers: {
      handoff: 'Step 2, drafting the update per client. I want a first draft I can edit.',
      output: 'Four short paragraphs, no bullets, under 200 words, direct tone.',
      keep: 'The final recommendation line. That is my read and it stays mine.',
      context: 'Never invent a number. If a figure is missing write MISSING and keep going.',
      notes: []
    }
  })));
  const goodPrompt = await page.locator('#bw-prompt-v2').inputValue();
  check('a good prompt carries no NEEDS DETAIL markers', !goodPrompt.includes('[NEEDS DETAIL'));
  check('a good prompt gets no warning banner',
    !(await page.locator('#bw-v2-source').getAttribute('class')).includes('bw-notice-warn'));
  await ctx.close();

  // ---- 5. a sweeping handoff plus a carve-out is reconciled out loud ----
  ({ ctx, page } = await open('artifact', seed({
    botAnswers: {
      handoff: 'Honestly all of it. Step 2 especially - checking criteria is just matching a list.',
      output: 'One paragraph per candidate, plain language, no more than 150 words.',
      keep: 'The final eligible or not eligible call. That has to be me.',
      context: 'Never infer a value that was not in the questionnaire, say MISSING instead.',
      notes: []
    }
  })));
  const amara = await page.locator('#bw-prompt-v2').inputValue();
  const task = amara.split('## WHAT I NEED YOU TO DO')[1].split('## WHAT STAYS')[0];
  check('the contradiction is named in the task section', task.includes('exception'), task.trim().slice(0, 160));
  check('and the carve-out is spelled out there', task.includes('eligible or not eligible'));
  check('with an explicit do-not instruction', task.includes('Do not produce that part'));
  await ctx.close();

  // ---- 6. instruction voice, not a transcript of complaints ----
  ({ ctx, page } = await open('artifact', seed({
    steps: [{ action: 'Pull delivery numbers', tools: 'Asana' },
            { action: 'Rebuild the twelve account slides', tools: 'PowerPoint' }],
    botAnswers: {
      handoff: 'Step 2, rebuilding the slides. Same layouts every week, and it eats an hour and a half on its own.',
      output: 'One slide per account, no more than 40 words each.',
      keep: 'The risk line stays mine, it is my read on the account.',
      context: 'Never estimate a number, write MISSING if a field is blank.',
      notes: []
    }
  })));
  const marcus = await page.locator('#bw-prompt-v2').inputValue();
  const marcusTask = marcus.split('## WHAT I NEED YOU TO DO')[1].split('## WHAT STAYS')[0];
  check('the task names the actual workflow step',
    marcusTask.includes('Rebuild the twelve account slides') && marcusTask.includes('PowerPoint'),
    marcusTask.trim().slice(0, 140));
  check('the complaint about how long it takes is dropped',
    !marcusTask.includes('eats an hour'), marcusTask.trim().slice(0, 140));
  check('no dangling punctuation from the edit', !/\s[,.]\s|\s{2,}\S/.test(marcusTask.trim()),
    JSON.stringify(marcusTask.trim().slice(0, 140)));
  await ctx.close();
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
if (server) server.close();
process.exit(passed ? 0 : 1);
