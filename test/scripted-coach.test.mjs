/*
 * Full walkthrough of the activity on the built-in scripted coach:
 * gating, the workflow builder, prompt generation, the conversation,
 * V2 capture, persistence, copy, reset, and mobile layout.
 */
import { serveSite, makeReporter, waitBots as wait, loadChromium } from './helpers.mjs';

const chromium = await loadChromium();

const PORT = 8899;
const FILE = 'http://127.0.0.1:' + PORT + '/';
const server = await serveSite(PORT);
const report = makeReporter('scripted coach');
const check = report.check;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await ctx.newPage();
report.watch(page);

const realBots = () => page.locator('.bw-msg-bot:not([data-typing])');
const waitBots = n => wait(page, n);

/* Landing, then home, then a stage - the way a learner actually arrives. */
const start = async () => { await page.click('#bw-start'); await page.waitForTimeout(700); };
const enter = async n => {
  await page.click(`.bw-station[data-stage="${n}"] .bw-station-card`);
  await page.waitForTimeout(650);
};
const toMap = async () => { await page.click('#bw-to-map'); await page.waitForTimeout(500); };
/* A coaching stage takes a turn to answer, so give each one room. */
const say = async (text, n) => {
  await page.fill('#bw-chat-input', text);
  await page.keyboard.press('Enter');
  await waitBots(n);
};

try {
  await page.goto(FILE);
  await page.waitForTimeout(300);

  check('lands on the landing, not the map', await page.locator('#bw-landing').isVisible());
  check('with a way in', await page.locator('#bw-start').isVisible());
  await start();
  check('start opens the journey map', await page.locator('#bw-map').isVisible());
  await enter(1);
  check('step2 locked at start', await page.locator('.bw-step[data-step="2"]').getAttribute('data-state') === 'locked');

  // Stage 1 opens on its lesson: artwork and prose, and nothing to fill in.
  check('stage 1 opens on the lesson', await page.locator('#bw-lesson-body').isVisible());
  check('the lesson has artwork', await page.locator('#bw-lesson-art svg').count() === 1);
  check('the lesson has copy', (await page.locator('#bw-lesson-copy').textContent()).trim().length > 80);
  check('nothing to fill in on the lesson', !(await page.locator('#bw-problem').isVisible()));
  check('and no chat underneath it', !(await page.locator('#bw-chat-panel').isVisible()));

  await page.click('#bw-lesson-next');
  await page.waitForTimeout(800);
  check('continue loads the coach', await page.locator('#bw-chat-panel').isVisible());
  check('and the lesson is gone', !(await page.locator('#bw-lesson-body').isVisible()));
  await waitBots(1);
  check('the coach asks for the task',
    (await realBots().first().textContent()).includes('hand off'),
    (await realBots().first().textContent()).slice(0, 120));

  await say('Every Monday I spend two hours building status updates for eleven clients, pulling the same numbers and rewriting the same sentences.', 2);
  check('one answer is not enough to move on',
    await page.locator('[data-action="save-and-continue"]').count() === 0);
  await say('It costs me most of Monday morning, and by the eleventh one the tone has drifted.', 3);
  check('the coach reads the problem back',
    (await realBots().last().textContent()).includes('eleven clients'),
    (await realBots().last().textContent()).slice(0, 160));
  check('and offers the handoff', await page.locator('[data-action="save-and-continue"]').isVisible());
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(700);
  check('step2 unlocked after valid problem', await page.locator('.bw-step[data-step="2"]').getAttribute('data-state') === 'active');
  check('step1 marked done', await page.locator('.bw-step[data-step="1"]').getAttribute('data-done') === 'true');
  check('the chat closes behind it', !(await page.locator('#bw-chat-panel').isVisible()));

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
  await page.waitForTimeout(500);

  // Stage 4 opens on its lesson; Continue hands off to the coach.
  check('a coaching stage opens on its lesson, not the chat',
    !(await page.locator('#bw-chat-panel').isVisible()));
  await page.click('[data-next="4"]');
  await page.waitForTimeout(700);
  check('continue hands off to the coach', await page.locator('#bw-chat-panel').isVisible());

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

  // The coach's own next-step card is what moves the learner onward now.
  check('the coach offers the handoff once it has enough',
    await page.locator('[data-action="save-and-continue"]').isVisible());
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(600);
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
  check('reload skips the landing once started', await page.locator('#bw-map').isVisible());
  await enter(5);
  check('reload restores step 5', await page.locator('.bw-step[data-step="5"]').getAttribute('data-state') === 'active');
  check('reload restores V2 text', (await page.locator('#bw-prompt-v2').inputValue()).includes('under 200 words'));
  check('reload restores 4 cards', await page.locator('#bw-cards .bw-card').count() === 4);
  check('reload restores problem', (await page.evaluate(() =>
    JSON.parse(localStorage.getItem('brainstorm_workflow_data')).problem)).includes('Every Monday'));
  await toMap();
  await enter(4);
  await page.waitForTimeout(400);
  check('reload restores full transcript', await page.locator('.bw-msg').count() === 9,
    'msgs=' + await page.locator('.bw-msg').count());
  // Each stage keeps its own conversation; stage 4's is not stage 1's.
  check("a stage's transcript is its own",
    !(await page.locator('#bw-chat-log').textContent()).includes('big picture'));
  await toMap();
  await enter(1);
  await page.waitForTimeout(400);
  check('stage 1 keeps its own transcript', await page.locator('.bw-msg').count() === 5,
    'msgs=' + await page.locator('.bw-msg').count());
  await toMap();
  await enter(5);
  await page.waitForTimeout(300);

  // manual edit beats regeneration until explicitly rebuilt
  await page.fill('#bw-prompt-v2', 'MY OWN EDIT');
  await page.reload();
  await page.waitForTimeout(400);
  await enter(5);
  check('user edit survives reload', (await page.locator('#bw-prompt-v2').inputValue()) === 'MY OWN EDIT');
  check('source note hidden after user edit', await page.locator('#bw-v2-source').isHidden());
  await page.click('#bw-regen-v2');
  await page.click('#bw-regen-v2');   // inline confirm: second press commits
  await page.waitForTimeout(300);
  check('rebuild restores generated prompt', (await page.locator('#bw-prompt-v2').inputValue()).includes('under 200 words'));

  // copy
  await page.click('#bw-copy-final');
  await page.waitForTimeout(300);
  check('copy confirms to learner', (await page.locator('#bw-copy-status').textContent()).includes('Copied'));
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('clipboard holds the prompt', clip.includes('WHAT STAYS WITH ME'), clip.slice(0, 60));
  check('progress reads complete', (await page.locator('#bw-progress-label').textContent()) === 'Complete');

  // Stage 1 has no field to edit any more, so starting its conversation over
  // is how a learner takes the problem statement back.
  await toMap();
  await enter(1);
  await page.waitForTimeout(500);
  check('a part-way conversation reopens on the coach, not the lesson',
    await page.locator('#bw-chat-panel').isVisible());
  await page.click('#bw-coach-restart');
  await page.click('#bw-coach-restart');   // inline confirm: second press commits
  await waitBots(1);
  check('starting over clears what the conversation took down',
    await page.locator('[data-card="problem-summary"]').count() === 0);
  check('stage 1 un-ticks when broken', await page.locator('.bw-step[data-step="1"]').getAttribute('data-done') === 'false');
  await toMap();
  // Entered and no longer finished, which is "current" rather than "available".
  check('and the map says so', await page.locator('.bw-station[data-stage="1"]').getAttribute('data-state') === 'current',
    await page.locator('.bw-station[data-stage="1"]').getAttribute('data-state'));
  await enter(1);
  await page.waitForTimeout(500);
  // Nothing said yet, so it opens on the lesson again rather than on a blank chat.
  check('a cleared conversation reopens on the lesson', await page.locator('#bw-lesson-body').isVisible());
  await page.click('#bw-lesson-next');
  await page.waitForTimeout(800);
  check('and the coach is not asked to open twice', await page.locator('.bw-msg').count() === 1,
    'msgs=' + await page.locator('.bw-msg').count());
  await say('Every Monday I rebuild eleven client status updates by hand, and it eats two hours.', 2);
  await say('The clients need it by nine, and the tone drifts by the eleventh one.', 3);
  check('the handoff comes back once the coach has it again',
    await page.locator('[data-action="save-and-continue"]').isVisible());
  await page.click('[data-action="save-and-continue"]');
  await page.waitForTimeout(600);
  check('stage 1 re-ticks when the coach has it again',
    await page.locator('.bw-step[data-step="1"]').getAttribute('data-done') === 'true');

  // restart conversation
  await toMap();
  await enter(4);
  await page.waitForTimeout(400);
  // Returning to a stage mid-conversation picks the conversation back up.
  check('re-entering a coaching stage resumes the conversation',
    await page.locator('#bw-chat-panel').isVisible());
  await page.click('#bw-coach-restart');
  await page.click('#bw-coach-restart');   // inline confirm: second press commits
  await waitBots(1);
  check('restart clears to one opening message', await page.locator('.bw-msg').count() === 1,
    'msgs=' + await page.locator('.bw-msg').count());

  // reset
  await page.click('#bw-reset');
  await page.click('#bw-reset');   // inline confirm: second press commits
  await page.waitForTimeout(700);
  check('reset returns to the landing', await page.locator('#bw-landing').isVisible());
  await start();
  check('reset relocks step 2', await page.locator('.bw-step[data-step="2"]').getAttribute('data-state') === 'locked');
  check('reset relocks the map', await page.locator('.bw-station[data-stage="2"]').getAttribute('data-state') === 'locked');
  await enter(1);
  check('reset returns stage 1 to its lesson', await page.locator('#bw-lesson-body').isVisible());
  check('reset clears problem', (await page.evaluate(() =>
    JSON.parse(localStorage.getItem('brainstorm_workflow_data') || '{}').problem || '')) === '');

  // responsive smoke: no horizontal overflow at 360px, on both views
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(250);
  const over = () => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow in a stage at 360px', await over() <= 1, 'overflow=' + await over() + 'px');
  await toMap();
  check('no horizontal overflow on the map at 360px', await over() <= 1, 'overflow=' + await over() + 'px');
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
