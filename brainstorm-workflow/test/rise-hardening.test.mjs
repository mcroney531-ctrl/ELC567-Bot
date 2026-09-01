/*
 * Hardening for the one environment that matters: a published Review 360 link,
 * where the activity runs inside a Rise iframe we don't control. Covers the
 * failure modes that iframe imposes - OS dark mode, a clipboard API the frame
 * was never granted, blocked modals, and host page character encoding.
 */
import fs from 'node:fs';
import { serveHtml, readActivity, withConfig, makeReporter, ACTIVITY, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('rise hardening');
const check = report.check;

// A finished activity, so step 5 is reachable without walking the whole flow.
const SEED = {
  version: 1,
  problem: 'Every Monday I spend two hours building status updates for eleven clients by hand.',
  steps: [{ action: 'Pull delivery numbers', tools: 'Asana' }, { action: 'Draft the update', tools: 'Google Docs' }],
  toolsAll: ['Asana', 'Google Docs'],
  masterPromptV1: '', masterPromptV2: '## CONTEXT\nThe finished master prompt.', v2Source: 'bot',
  botConversation: [], botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
  mockStage: 0, progress: { current: 5, unlocked: 5, done: { 1: true, 2: true } }
};

let server, browser;
try {
  browser = await chromium.launch();

  // ---- 1. encoding: the file must not depend on the host page's charset ----
  const raw = fs.readFileSync(ACTIVITY);
  const nonAscii = [...raw].filter(b => b > 127).length;
  check('activity file is pure ASCII', nonAscii === 0, nonAscii + ' non-ascii bytes');
  check('no blocking modal calls left',
    !/window\.confirm\s*\(|window\.alert\s*\(|window\.prompt\s*\(/.test(readActivity()));

  // ---- 2. dark mode must not leak into a light Rise lesson ----
  server = await serveHtml(readActivity(), 8127);
  const bgOf = async (colorScheme, html) => {
    if (html) { server.close(); server = await serveHtml(html, 8127); }
    const ctx = await browser.newContext({ colorScheme });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8127/');
    await p.waitForTimeout(300);
    const bg = await p.locator('#bw').evaluate(n => getComputedStyle(n).backgroundColor);
    await ctx.close();
    return bg;
  };
  const light = v => { const m = v.match(/\d+/g); return m && Number(m[0]) > 200; };
  check('light OS renders light', light(await bgOf('light')));
  check('dark OS still renders light by default', light(await bgOf('dark')), await bgOf('dark'));
  const optIn = withConfig({ followSystemDarkMode: 'true' });
  check('dark mode still available when opted in', !light(await bgOf('dark', optIn)));
  server.close();
  server = await serveHtml(readActivity(), 8127);

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
    await p.goto('http://127.0.0.1:8128/');
    await p.waitForTimeout(400);
    return { ctx, p };
  };
  const artifactServer = await serveHtml(withConfig({ blockRole: '"artifact"' }), 8128);

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
