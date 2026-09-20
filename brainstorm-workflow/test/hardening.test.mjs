/*
 * The failure modes that survived the move off Rise. Three of the four were
 * found inside a Rise iframe, but none of them are Rise's fault: a browser can
 * withhold the async clipboard API on any origin, block modals in any embed,
 * and follow an OS dark mode the lesson around it does not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { serveSite, readActivity, makeReporter, ROOT, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('hardening');
const check = report.check;

// A finished activity, so step 5 is reachable without walking the whole flow.
const SEED = {
  version: 2,
  problem: 'Every Monday I spend two hours building status updates for eleven clients by hand.',
  steps: [{ action: 'Pull delivery numbers', tools: 'Asana' }, { action: 'Draft the update', tools: 'Google Docs' }],
  toolsAll: ['Asana', 'Google Docs'],
  masterPromptV1: '', masterPromptV2: '## CONTEXT\nThe finished master prompt.', v2Source: 'bot',
  conversations: { all: [], handoff: [], standards: [], guardrails: [] },
  mockProgress: { all: 0, handoff: 0, standards: 0, guardrails: 0 },
  botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
  progress: { current: 5, unlocked: 5, done: { 1: true, 2: true } }
};

let server, browser;
try {
  browser = await chromium.launch();

  // ---- 1. encoding is declared rather than inherited ----
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('the page declares its charset', /<meta charset="utf-8">/i.test(html));
  check('and declares it before any content', html.indexOf('charset') < html.indexOf('<body'));
  check('no blocking modal calls left',
    !/window\.confirm\s*\(|window\.alert\s*\(|window\.prompt\s*\(/.test(readActivity()));

  // ---- 2. dark mode must not leak into a light Rise lesson ----
  server = await serveSite(8127);
  const bgOf = async (colorScheme, dark) => {
    const ctx = await browser.newContext({ colorScheme });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8127/' + (dark ? '?dark=1' : ''));
    await p.waitForTimeout(300);
    const bg = await p.locator('#bw').evaluate(n => getComputedStyle(n).backgroundColor);
    await ctx.close();
    return bg;
  };
  const light = v => { const m = v.match(/\d+/g); return m && Number(m[0]) > 200; };
  check('light OS renders light', light(await bgOf('light')));
  check('dark OS still renders light by default', light(await bgOf('dark')), await bgOf('dark'));
  server.close();
  server = await serveSite(8127, { followSystemDarkMode: 'true' });
  check('dark mode still available when opted in', !light(await bgOf('dark')));
  server.close();
  server = await serveSite(8127);

  // ---- 3. clipboard: the frame may never have been granted the async API ----
  const artifactPage = async (breakClipboard, breakExecCommand) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    report.watch(p);
    await p.addInitScript(([seed, noClip, noExec]) => {
      localStorage.setItem('brainstorm_workflow_data', seed);
      if (noClip) { try { delete navigator.clipboard; } catch (e) { /* getter-only */ } }
      if (noExec) document.execCommand = () => false;
    }, [JSON.stringify(SEED), breakClipboard, breakExecCommand]);
    await p.goto('http://127.0.0.1:8128/role/artifact');
    await p.waitForTimeout(400);
    return { ctx, p };
  };
  const artifactServer = await serveSite(8128);

  let { ctx, p } = await artifactPage(true, false);   // no async API, execCommand works
  check('step 5 reachable from seeded state', await p.locator('#bw-prompt-v2').isVisible());
  await p.locator('#bw-copy-final').click();
  await p.waitForTimeout(300);
  check('copy succeeds without the async clipboard API',
    (await p.locator('#bw-copy-status').textContent()).includes('Copied'),
    await p.locator('#bw-copy-status').textContent());
  await ctx.close();

  ({ ctx, p } = await artifactPage(true, true));      // both paths unavailable
  await p.locator('#bw-copy-final').click();
  await p.waitForTimeout(300);
  const status = await p.locator('#bw-copy-status').textContent();
  check('total copy failure tells them how to copy by hand', status.includes('Ctrl+C'), status);
  const sel = await p.locator('#bw-prompt-v2').evaluate(n => n.selectionEnd - n.selectionStart);
  check('total copy failure leaves the prompt selected', sel > 10, 'selected chars=' + sel);
  await ctx.close();

  // ---- 4. destructive actions must not depend on window.confirm ----
  ({ ctx, p } = await artifactPage(false, false));
  await p.locator('#bw-reset').click();
  await p.waitForTimeout(200);
  check('one press does not erase anything',
    (await p.evaluate(() => localStorage.getItem('brainstorm_workflow_data'))) !== null);
  check('one press asks for confirmation on the button',
    (await p.locator('#bw-reset').textContent()).toLowerCase().includes('again'),
    await p.locator('#bw-reset').textContent());
  await p.locator('#bw-reset').click();
  await p.waitForTimeout(400);
  check('second press erases',
    (await p.evaluate(() => localStorage.getItem('brainstorm_workflow_data'))) === null);
  check('button reverts after committing',
    !(await p.locator('#bw-reset').textContent()).toLowerCase().includes('again'));
  await ctx.close();
  artifactServer.close();
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
if (browser) await browser.close();
if (server) server.close();
process.exit(passed ? 0 : 1);
