/*
 * Runs each persona through the real built lesson and captures what actually
 * comes out: every coach message, and the finished master prompt.
 *
 *   node personas/run.mjs        -> writes personas/results.json + .md
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadChromium } from '../test/helpers.mjs';
import { PERSONAS } from './personas.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
execFileSync(process.execPath, [path.join(ROOT, 'build.mjs')], { stdio: 'pipe' });

const FILES = [
  ['capture', '1-capture.html'], ['c1', '2-coach-handoff.html'],
  ['c2', '3-coach-standards.html'], ['c3', '4-coach-guardrails.html'],
  ['artifact', '5-artifact.html']
];
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const lesson = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
${FILES.map(([id, f]) => `<iframe id="${id}" style="width:900px;height:820px;border:0" srcdoc="${
  esc(fs.readFileSync(path.join(ROOT, 'dist', f), 'utf8'))}"></iframe>`).join('\n')}
</body></html>`;

const server = await new Promise(r => {
  const s = http.createServer((rq, rs) => {
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(lesson);
  });
  s.listen(8150, () => r(s));
});

const chromium = await loadChromium();
const browser = await chromium.launch();
const results = [];

for (const p of PERSONAS) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8150/');
  await page.waitForTimeout(900);

  const F = id => page.frameLocator('#' + id);
  const waitBots = (id, n) => page.waitForFunction(
    ([fid, k]) => document.querySelector('#' + fid).contentDocument
      .querySelectorAll('.bw-msg-bot:not([data-typing])').length >= k, [id, n], { timeout: 15000 });
  const say = async (id, text, n) => {
    await F(id).locator('#bw-chat-input').fill(text);
    await F(id).locator('#bw-chat-send').click();
    await waitBots(id, n);
  };
  const transcript = async id => page.evaluate(fid => {
    const d = document.querySelector('#' + fid).contentDocument;
    return [...d.querySelectorAll('.bw-msg:not([data-typing])')].map(m => ({
      who: m.classList.contains('bw-msg-user') ? 'learner' : 'coach',
      text: m.querySelector('.bw-msg-body').innerText.trim()
    }));
  }, id);

  // capture form
  await F('capture').locator('#bw-problem').fill(p.problem);
  await F('capture').locator('[data-next="1"]').click();
  for (let i = 2; i < p.steps.length; i++) await F('capture').locator('#bw-add-step').click();
  const cards = F('capture').locator('#bw-cards .bw-card');
  for (let i = 0; i < p.steps.length; i++) {
    await cards.nth(i).locator('input').nth(0).fill(p.steps[i][0]);
    await cards.nth(i).locator('input').nth(1).fill(p.steps[i][1]);
  }
  await F('capture').locator('[data-next="2"]').click();
  await page.waitForTimeout(900);
  const draft = await F('capture').locator('#bw-prompt-v1').textContent();

  // three chats
  await waitBots('c1', 1);
  await say('c1', p.handoff, 2);
  await waitBots('c2', 1);
  await page.waitForTimeout(1400);          // let the opening pick up chat 1
  await say('c2', p.output, 2);
  await say('c2', p.keep, 3);
  await waitBots('c3', 1);
  await page.waitForTimeout(1400);
  await say('c3', p.context, 2);
  await page.waitForTimeout(1400);

  const master = await F('artifact').locator('#bw-prompt-v2').inputValue();
  results.push({
    id: p.id, name: p.name, role: p.role, tests: p.tests,
    inputs: { problem: p.problem, steps: p.steps,
              answers: { handoff: p.handoff, output: p.output, keep: p.keep, context: p.context } },
    draftPrompt: draft,
    chats: { handoff: await transcript('c1'), standards: await transcript('c2'), guardrails: await transcript('c3') },
    masterPrompt: master,
    pageErrors: errors
  });
  console.log(`${p.name}: master prompt ${master.length} chars, ${errors.length} page errors`);
  await ctx.close();
}

fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 2));

const md = results.map(r => [
  `# ${r.name} - ${r.role}`, '', `_${r.tests}_`, '',
  '## What they typed', '', '**Problem:** ' + r.inputs.problem, '',
  ...r.inputs.steps.map((s, i) => `${i + 1}. ${s[0]} - _${s[1]}_`), '',
  ...['handoff', 'output', 'keep', 'context'].map(k => `**${k}:** ${r.inputs.answers[k]}`), '',
  '## The master prompt it produced', '', '```', r.masterPrompt, '```', ''
].join('\n')).join('\n---\n\n');
fs.writeFileSync(path.join(HERE, 'results.md'), md);

await browser.close();
server.close();
console.log('\nwrote personas/results.json and personas/results.md');
