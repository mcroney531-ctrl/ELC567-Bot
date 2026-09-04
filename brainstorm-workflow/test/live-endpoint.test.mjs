/*
 * Exercises the live-endpoint adapter: request shape, every response shape the
 * adapter claims to accept, and the failure modes (HTTP error, timeout,
 * unreachable host, unrecognized payload) a learner can hit mid-activity.
 */
import { server, state } from './coach-stub.mjs';
import { serveHtml, withConfig, makeReporter, waitBots as wait, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();

// Page variant pointed at the stub, with a short timeout so the hang test is quick.
const html = withConfig({
  botEndpoint: '"http://127.0.0.1:8900/coach"',
  botHeaders: '{ "x-course-key": "elc567" }',
  botTimeoutMs: '1500'
});
await new Promise(r => server.listen(8900, r));
const statics = await serveHtml(html, 8901);

const report = makeReporter('live endpoint');
const check = report.check;

const browser = await chromium.launch();
let page;
const bots = () => page.locator('.bw-msg-bot:not([data-typing])');
const waitBots = n => wait(page, n);

// Each scenario gets its own context so localStorage starts genuinely empty.
async function fillToStep4() {
  const ctx = await browser.newContext();
  page = await ctx.newPage();
  report.watch(page);
  await page.goto('http://127.0.0.1:8901/');
  await page.fill('#bw-problem', 'Every Monday I rebuild the same eleven client status updates by hand, and it eats two hours.');
  await page.click('[data-next="1"]');
  const c = page.locator('#bw-cards .bw-card');
  await c.nth(0).locator('input').nth(0).fill('Pull delivery numbers');
  await c.nth(0).locator('input').nth(1).fill('Asana, Harvest');
  await c.nth(1).locator('input').nth(0).fill('Draft the update');
  await c.nth(1).locator('input').nth(1).fill('Google Docs');
  await page.click('[data-next="2"]');
  await page.click('[data-next="3"]');
}

try {
  // --- 1. live badge + priming request shape ---
  state.mode = 'reply'; state.requests.length = 0; state.headers.length = 0;
  await fillToStep4();
  check('badge names the live assistant',
    (await page.locator('#bw-bot-badge').textContent()).includes('AI learning assistant'),
    await page.locator('#bw-bot-badge').textContent());
  await waitBots(1);
  check('opening comes from the endpoint', (await bots().first().textContent()).includes('Live reply one'));
  const req = state.requests[0];
  check('sends system prompt', typeof req.system === 'string' && req.system.includes('master-prompt'));
  check('sends context block', req.context.includes('Pull delivery numbers') && req.context.includes('Asana, Harvest'));
  check('context includes the problem', req.context.includes('eleven client status updates'));
  check('priming turn is the only message', req.messages.length === 1 && req.messages[0].role === 'user');
  check('priming turn asks for first question', req.messages[0].content.includes('Start by asking me'));
  check('priming turn is not shown in the log', await page.locator('.bw-msg-user').count() === 0);

  // --- 2. transcript accumulates in wire format ---
  await page.fill('#bw-chat-input', 'The drafting step.');
  await page.keyboard.press('Enter');
  await waitBots(2);
  const req2 = state.requests[1];
  check('history sent as user/assistant roles',
    req2.messages.map(m => m.role).join(',') === 'user,assistant,user', req2.messages.map(m => m.role).join(','));
  check('latest learner turn is last', req2.messages[2].content === 'The drafting step.');
  check('custom header reaches the endpoint', state.headers[0]['x-course-key'] === 'elc567', JSON.stringify(state.headers[0] || {}));
  check('content-type is json', state.headers[0]['content-type'] === 'application/json');

  // --- 3. error handling + retry ---
  state.mode = 'error';
  await page.fill('#bw-chat-input', 'This one will fail.');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#bw-chat-error:not([hidden])', { timeout: 8000 });
  const errText = await page.locator('#bw-chat-error').textContent();
  check('surfaces the status code', errText.includes('503'), errText);
  check('offers a fallback path', errText.includes('Step 5'), errText);
  check('input re-enabled after failure', !(await page.locator('#bw-chat-input').isDisabled()));
  check('failed turn still shows learner message', await page.locator('.bw-msg-user').count() === 2);
  state.mode = 'anthropic';
  await page.click('#bw-chat-error .bw-btn');
  await waitBots(3);
  check('retry recovers', (await bots().last().textContent()).includes('finished prompt'));
  check('error notice cleared after retry', await page.locator('#bw-chat-error').isHidden());
  check('no duplicate learner message on retry', await page.locator('.bw-msg-user').count() === 2);

  // --- 4. anthropic-shaped fenced block flows into V2 ---
  check('fenced block rendered as pre', await bots().last().locator('pre').count() === 1);
  await page.click('[data-next="4"]');
  const v2 = await page.locator('#bw-prompt-v2').inputValue();
  check('V2 lifted from live coach', v2.includes('Live-endpoint context line'), v2.slice(0, 90));
  check('V2 credits the coach', (await page.locator('#bw-v2-source').textContent()).includes('conversation with the coach'));

  // --- 5. timeout ---
  state.mode = 'hang';
  await fillToStep4();
  await page.waitForSelector('#bw-chat-error:not([hidden])', { timeout: 8000 });
  check('timeout reported plainly', (await page.locator('#bw-chat-error').textContent()).includes('too long'),
    await page.locator('#bw-chat-error').textContent());

  // --- 6. unrecognized payload ---
  state.mode = 'junk';
  await fillToStep4();
  await page.waitForSelector('#bw-chat-error:not([hidden])', { timeout: 8000 });
  check('unknown shape reported', (await page.locator('#bw-chat-error').textContent()).includes("format this activity doesn't recognize"),
    await page.locator('#bw-chat-error').textContent());

  // --- 7. bare-string and openai shapes ---
  state.mode = 'bare';
  await fillToStep4();
  await waitBots(1);
  check('bare string reply accepted', (await bots().first().textContent()).includes('Bare string reply'));
  state.mode = 'openai';
  await fillToStep4();
  await waitBots(1);
  check('openai shape accepted', (await bots().first().textContent()).includes('OpenAI-shaped reply'));

  // --- 8. dead endpoint (connection refused) ---
  await new Promise(r => server.close(r));
  await fillToStep4();
  await page.waitForSelector('#bw-chat-error:not([hidden])', { timeout: 8000 });
  check('unreachable endpoint reported', (await page.locator('#bw-chat-error').textContent()).includes("Couldn't reach"),
    await page.locator('#bw-chat-error').textContent());
  // learner can still finish without the coach
  await page.fill('#bw-chat-input', 'I want the drafting handled.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.fill('#bw-chat-input', 'Four short paragraphs, under 200 words.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.click('[data-next="4"]');
  check('learner reaches step 5 with the coach down',
    await page.locator('.bw-step[data-step="5"]').getAttribute('data-state') === 'active');
  const fallbackV2 = await page.locator('#bw-prompt-v2').inputValue();
  check('fallback V2 is the template', fallbackV2.includes('## CONTEXT') && fallbackV2.includes('[Name the steps'), fallbackV2.slice(0, 120));
  check('fallback note explains the brackets',
    (await page.locator('#bw-v2-source').textContent()).includes('[brackets]'));
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
try { server.close(); } catch (e) { /* already closed by the unreachable-host test */ }
statics.close();
process.exit(passed ? 0 : 1);
