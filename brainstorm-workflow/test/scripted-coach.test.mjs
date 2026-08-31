/*
 * Full walkthrough of the activity on the built-in scripted coach:
 * gating, the workflow builder, prompt generation, the conversation,
 * V2 capture, persistence, copy, reset, and mobile layout.
 */
import { serveHtml, readActivity, makeReporter, waitBots as wait, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();

const PORT = 8899;
const FILE = 'http://127.0.0.1:' + PORT + '/';
const server = await serveHtml(readActivity(), PORT);
const report = makeReporter('scripted coach');
const check = report.check;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await ctx.newPage();
report.watch(page);

const realBots = () => page.locator('.bw-msg-bot:not([data-typing])');
const waitBots = n => wait(page, n);

try {
  await page.goto(FILE);
  await page.waitForTimeout(200);

  check('step2 locked at start', await page.locator('.bw-step[data-step="2"]').getAttribute('data-state') === 'locked');
  await page.click('[data-next="1"]');
  check('short problem blocked', !(await page.locator('#bw-warn-1').isHidden()));

  await page.fill('#bw-problem', 'Every Monday I spend two hours building status updates for eleven clients, pulling the same numbers and rewriting the same sentences.');
  await page.click('[data-next="1"]');
  check('step2 unlocked after valid problem', await page.locator('.bw-step[data-step="2"]').getAttribute('data-state') === 'active');
  check('step1 marked done', await page.locator('.bw-step[data-step="1"]').getAttribute('data-done') === 'true');

  await page.click('[data-next="2"]');
  check('empty cards blocked', !(await page.locator('#bw-warn-2').isHidden()));
  const cards = () => page.locator('#bw-cards .bw-card');
  check('starts with 2 cards', await cards().count() === 2);
  check('remove disabled at minimum', await cards().nth(0).locator('.bw-card-remove').isDisabled());
  await page.click('#bw-add-step'); await page.click('#bw-add-step');
  check('added to 4 cards', await cards().count() === 4);
  const rows = [
    ["Pull last week's delivery numbers", 'Asana, Harvest'],
    ['Check the shared inbox for anything unresolved', 'Gmail'],
    ['Write a four paragraph update per client', 'Google Docs'],
    ["Reformat into the client's preferred channel", 'Gmail and Slack'],
  ];
  for (let i = 0; i < 4; i++) {
    await cards().nth(i).locator('input').nth(0).fill(rows[i][0]);
    await cards().nth(i).locator('input').nth(1).fill(rows[i][1]);
  }
  check('remove enabled with 4 cards', !(await cards().nth(0).locator('.bw-card-remove').isDisabled()));
  await cards().nth(3).locator('.bw-card-remove').click();
  check('card removed -> 3', await cards().count() === 3);
  await page.click('#bw-add-step');
  await cards().nth(3).locator('input').nth(0).fill(rows[3][0]);
  await cards().nth(3).locator('input').nth(1).fill(rows[3][1]);
  await page.click('[data-next="2"]');
  check('step3 open', await page.locator('.bw-step[data-step="3"]').getAttribute('data-state') === 'active');

  const v1 = await page.locator('#bw-prompt-v1').textContent();
  check('V1 has problem', v1.includes('eleven clients'));
  check('V1 lists 4 steps', /1\..*\n2\..*\n3\..*\n4\./s.test(v1), v1.slice(0, 300));
  check('V1 dedupes tools across steps', /Asana, Harvest, Gmail, Google Docs, Slack/.test(v1), v1);
  await page.click('[data-next="3"]');

  check('badge shows guided coach', (await page.locator('#bw-bot-badge').textContent()).includes('Guided'));
  await waitBots(1);
  const opening = await realBots().first().textContent();
  check('opening quotes the problem', opening.includes('Every Monday'), opening.slice(0, 120));
  check('opening lists their steps with tools', opening.includes('Asana, Harvest'), opening.slice(0, 200));
  await page.fill('#bw-chat-input', 'first answer, sent while I watch the lock');
  await page.keyboard.press('Enter');   // the send handler locks the composer synchronously
  const [lockedInput, lockedBtn, typingCount] = await Promise.all([
    page.locator('#bw-chat-input').isDisabled(),
    page.locator('#bw-chat-send').isDisabled(),
    page.locator('[data-typing]').count()
  ]);
  const typingUp = typingCount === 1;
  check('composer locks while the coach thinks', lockedInput && lockedBtn, 'input=' + lockedInput + ' btn=' + lockedBtn);
  check('typing indicator shows while thinking', typingUp);
  await waitBots(2);
  check('composer unlocks after reply', !(await page.locator('#bw-chat-input').isDisabled()));

  const answers = [
    'Four short paragraphs, no bullets, under 200 words, direct client-facing tone with no hedging.',
    'The last paragraph, the "what I would watch next week" call. That judgment is mine.',
    'Never invent a number. If a figure is missing from what I paste, write MISSING and keep going.',
  ];
  for (let i = 0; i < answers.length; i++) {
    await page.fill('#bw-chat-input', answers[i]);
    await page.keyboard.press('Enter');
    await waitBots(i + 3);
  }
  check('all four answers landed', await page.locator('.bw-msg-user').count() === 4,
    'user msgs=' + await page.locator('.bw-msg-user').count());
  const lastBot = realBots().last();
  check('coach emits one fenced block', await lastBot.locator('pre').count() === 1);
  const lastText = await lastBot.textContent();
  check('block carries all sections', ['CONTEXT','WHAT I NEED YOU TO DO','WHAT STAYS WITH ME','OUTPUT I EXPECT','THINGS YOU NEED TO KNOW'].every(h => lastText.includes(h)));

  await page.click('[data-next="4"]');
  check('step5 open', await page.locator('.bw-step[data-step="5"]').getAttribute('data-state') === 'active');

  const v2 = await page.locator('#bw-prompt-v2').inputValue();
  check('V2 parsed out of the fenced block', v2.startsWith('## CONTEXT'), v2.slice(0, 80));
  check('V2 has no stray fence markers', !v2.includes('```'), v2.slice(0, 80));
  check('V2 carries handoff answer', v2.includes('while I watch the lock'));
  check('V2 carries output answer', v2.includes('under 200 words'));
  check('V2 carries keep answer', v2.includes('judgment is mine'));
  check('V2 carries context answer', v2.includes('Never invent a number'));
  check('V2 has no unfilled placeholders', !/\[Name the steps|\[Format, length|\[Facts, constraints/.test(v2), v2);
  check('V2 source note credits the coach', (await page.locator('#bw-v2-source').textContent()).includes('conversation with the coach'));

  // persistence
  await page.reload();
  await page.waitForTimeout(400);
  check('reload restores step 5', await page.locator('.bw-step[data-step="5"]').getAttribute('data-state') === 'active');
  check('reload restores V2 text', (await page.locator('#bw-prompt-v2').inputValue()).includes('under 200 words'));
  check('reload restores full transcript', await page.locator('.bw-msg').count() === 9,
    'msgs=' + await page.locator('.bw-msg').count());
  check('reload restores 4 cards', await page.locator('#bw-cards .bw-card').count() === 4);
  check('reload restores problem', (await page.locator('#bw-problem').inputValue()).includes('Every Monday'));

  // manual edit beats regeneration until explicitly rebuilt
  await page.fill('#bw-prompt-v2', 'MY OWN EDIT');
  await page.reload();
  await page.waitForTimeout(400);
  check('user edit survives reload', (await page.locator('#bw-prompt-v2').inputValue()) === 'MY OWN EDIT');
  check('source note hidden after user edit', await page.locator('#bw-v2-source').isHidden());
  page.once('dialog', d => d.accept());
  await page.click('#bw-regen-v2');
  await page.waitForTimeout(300);
  check('rebuild restores generated prompt', (await page.locator('#bw-prompt-v2').inputValue()).includes('under 200 words'));

  // copy
  await page.click('#bw-copy-final');
  await page.waitForTimeout(300);
  check('copy confirms to learner', (await page.locator('#bw-copy-status').textContent()).includes('Copied'));
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('clipboard holds the prompt', clip.includes('WHAT STAYS WITH ME'), clip.slice(0, 60));
  check('progress reads complete', (await page.locator('#bw-progress-label').textContent()) === 'Complete');

  // editing step 1 back to invalid re-opens the gate
  await page.click('#bw-head-1');
  await page.fill('#bw-problem', 'too short');
  await page.click('#bw-head-2');
  check('step 1 un-ticks when broken', await page.locator('.bw-step[data-step="1"]').getAttribute('data-done') === 'false');
  await page.click('#bw-head-1');
  await page.fill('#bw-problem', 'Every Monday I spend two hours building status updates for eleven clients.');
  await page.click('[data-next="1"]');
  check('step 1 re-ticks when fixed', await page.locator('.bw-step[data-step="1"]').getAttribute('data-done') === 'true');

  // restart conversation
  await page.click('#bw-head-4');
  page.once('dialog', d => d.accept());
  await page.click('#bw-chat-restart');
  await waitBots(1);
  check('restart clears to one opening message', await page.locator('.bw-msg').count() === 1,
    'msgs=' + await page.locator('.bw-msg').count());

  // reset
  page.once('dialog', d => d.accept());
  await page.click('#bw-reset');
  await page.waitForTimeout(700);
  check('reset clears problem', (await page.locator('#bw-problem').inputValue()) === '');
  check('reset relocks step 2', await page.locator('.bw-step[data-step="2"]').getAttribute('data-state') === 'locked');

  // responsive smoke: no horizontal overflow at 360px
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow at 360px', overflow <= 1, 'overflow=' + overflow + 'px');
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
