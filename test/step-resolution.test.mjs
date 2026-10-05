/*
 * Which mapped step a handoff answer is about - and, above all, never the wrong one.
 *
 * Deploy's "WHAT I NEED YOU TO DO" section opens, when the learner's answer can be
 * tied to one mapped step, with a canonical line: "Take over this step of my
 * workflow: <that step> (<tools>)." Everything the learner said stays underneath it.
 *
 * The matcher used to count raw word overlap and take the highest scorer. That
 * produced two kinds of wrong artifact, both found by walking the journey as a
 * learner:
 *
 *   - "Sending each update out to the client..." named step 3, "Draft a four
 *     paragraph update for each client". "update" and "client" are shared by
 *     steps 3 and 4 and won two to one, while "send" - the one word that tells
 *     the steps apart - was thrown away for being four letters long. The artifact
 *     then said Draft on one line and Sending on the next.
 *   - "The first draft of each update and the pulling of the numbers" named step 3
 *     alone, silently narrowing a handoff that was about steps 1 and 3.
 *
 * So the rule is precision over recall. A canonical line may appear only when the
 * answer points at exactly one mapped step; with several, or none, or an ambiguity,
 * the learner's own words stand alone. A missing canonical line costs nothing, since
 * their wording survives. A wrong one tells the assistant to do something the
 * learner did not ask for, in the one document the whole journey exists to produce.
 *
 * These tests read the GENERATED section, not just the matcher: the bug is in what
 * reaches Deploy, and a unit test on the resolver alone would leave the composition
 * path - the canonical line, the "in my words" line, the fallback - uncovered.
 */
import { serveSite, makeReporter, loadChromium, seedState } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('step resolution');
const check = report.check;

const PORT = 8183;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const STEPS = [
  { action: "Pull last week's delivery numbers", tools: 'Tableau' },
  { action: 'Check the shared inbox for anything unresolved', tools: 'Gmail' },
  { action: 'Draft a four paragraph update for each client', tools: 'Word' },
  { action: "Send each update in the client's preferred channel", tools: 'Gmail, Slack' }
];
const CANON = n => 'Take over this step of my workflow: ' + STEPS[n - 1].action + ' (' + STEPS[n - 1].tools + ').';
const OTHER_ANSWERS = {
  output: 'Four short paragraphs, no bullets, under two hundred words, direct.',
  keep: 'The call on what to flag next week stays mine.',
  context: 'Never invent a number that is not in the export.'
};

async function sectionFor(handoff) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  report.watch(page);
  const seed = seedState({
    steps: STEPS, toolsAll: ['Tableau', 'Gmail', 'Word', 'Slack'],
    botAnswers: { handoff, ...OTHER_ANSWERS, notes: [] },
    decided: { handoff: true, keep: true, output: true, context: true },
    progress: { current: 5, unlocked: 5, done: { 1: true, 2: true, 3: true, 4: true },
                entered: { 1: true, 2: true, 3: true, 4: true } }
  });
  await page.addInitScript(s => {
    localStorage.setItem('bw_started', '1');
    localStorage.setItem('brainstorm_workflow_data', s);
  }, JSON.stringify(seed));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(400);
  await page.click('.bw-station[data-stage="5"] .bw-station-card');
  await page.waitForTimeout(700);
  await page.click('#bw-lesson-next');
  await page.waitForTimeout(500);
  const prompt = await page.inputValue('#bw-prompt-v2');
  await ctx.close();
  return prompt.split('## WHAT I NEED YOU TO DO\n')[1].split('\n## ')[0].trim();
}

const canonical = sec => (sec.match(/^Take over this step of my workflow: .*$/m) || [null])[0];

try {
  // ======================= explicit numbers stay authoritative =======================
  let sec = await sectionFor('Step 4 - and I will approve each one before it goes.');
  check('"Step 4" resolves step 4', canonical(sec) === CANON(4), String(canonical(sec)));

  sec = await sectionFor('4. Each one, once I have approved it.');
  check('so does a leading "4."', canonical(sec) === CANON(4), String(canonical(sec)));

  /* An explicit number that is not a mapped step is not an answer about one. */
  sec = await sectionFor('Step 9 - whatever comes last.');
  check('a step number that does not exist resolves nothing', canonical(sec) === null, String(canonical(sec)));

  /* Naming two steps by number is the clearest multi-step answer there is. Taking
     the first and dropping the second would be the same narrowing as before, with a
     number instead of a word. */
  for (const answer of ['Step 1 and step 3 - the numbers and the drafting.',
                        'Steps 1 and 3, the numbers and the drafting of each update.']) {
    sec = await sectionFor(answer);
    check('two numbered steps are not collapsed to one: "' + answer.slice(0, 26) + '..."',
      canonical(sec) === null, String(canonical(sec)));
    check('and the learner\'s own words are what the section says', sec.includes(answer.slice(0, 20)), sec);
  }

  // ======================= "Step N only: ..." must not take the learner's qualifiers with it =======================
  /* Found by persona testing (P02, "Maggie"): her Refine answer was one sentence, "Step 4 only: drafting the
     narrative sections ... following the funder's template headings in order." The generator dropped every
     sentence that STARTS with "Step N", on the theory that it only points at the step. This one also said
     something the canonical Map line does not - an execution constraint - and "in order" vanished from the
     artifact while the report claimed it survived. What follows the pointer is the learner's own wording and
     stays; only the pointer itself goes. */
  sec = await sectionFor("Step 4 only: sending each update out in the client's preferred channel, once I have approved every one of them, in order of client priority.");
  check('"Step 4 only: ..." still resolves step 4', canonical(sec) === CANON(4), String(canonical(sec)));
  check('and the qualifier after the pointer survives ("in order of client priority")', sec.includes('in order of client priority'), sec);
  check('and what she said about approval survives', sec.includes('once I have approved every one of them'), sec);
  check('the pointer itself ("Step 4 only") does not leave debris', !/Step 4/.test(sec.split('\n').slice(1).join('\n')), sec);

  sec = await sectionFor('Step 4 - and I will approve each one before it goes.');
  check('"Step 4 - and I will approve..." keeps the approval instruction', sec.includes('approve each one before it goes'), sec);

  sec = await sectionFor('Step 4.');
  check('a bare pointer ("Step 4.") adds nothing but the canonical line',
    canonical(sec) === CANON(4) && !/In my words/.test(sec), sec);

  // ======================= a clear single step =======================
  sec = await sectionFor('Drafting the four paragraph update for each client, which I then review.');
  check('an unambiguous reference to Draft resolves step 3', canonical(sec) === CANON(3), String(canonical(sec)));
  check('and the useful canonical line leads the section',
    sec.indexOf('Take over this step') < sec.indexOf('review'), sec);

  /* pull / pulling: the normaliser's whole job. The old matcher dropped "pull" for
     being four letters, so this only ever matched on "delivery" and "numbers". */
  sec = await sectionFor('Pulling the delivery numbers each week, before the rest of the work begins.');
  check('"pulling the delivery numbers" resolves step 1', canonical(sec) === CANON(1), String(canonical(sec)));

  /* The cost of that conservatism, pinned on purpose so it is not "fixed" into a false
     positive later: "anything" is one of step 2's own words, so a sentence that merely
     says "anything else" carries evidence for two steps and gets no canonical line. The
     answer is not lost - it stands as written. */
  sec = await sectionFor('Pulling the delivery numbers each week before anything else happens.');
  check('a coincidental word from another step means no canonical line, not a guess',
    canonical(sec) === null && sec.includes('Pulling the delivery numbers'), sec);

  // ======================= the wrong step, which must never happen =======================
  const sending = 'Sending each update out to the client once I have approved it.';
  sec = await sectionFor(sending);
  check('"Sending each update..." must never resolve Draft (step 3)',
    canonical(sec) !== CANON(3) && !/Draft a four paragraph/.test(sec), sec);
  check('the section does not say Draft in one line and Sending in the next',
    !(canonical(sec) && /Draft/.test(canonical(sec)) && /Sending/.test(sec)), sec);
  check('and the learner\'s own wording survives either way', sec.includes('Sending each update out'), sec);

  // ======================= more than one step: no canonical line =======================
  const walkthrough = 'The first draft of each update and the pulling of the numbers. I want AI to assemble the routine parts, and I review the result.';
  sec = await sectionFor(walkthrough);
  check('the walkthrough answer (steps 1 and 3) is not collapsed to step 3', canonical(sec) !== CANON(3), sec);
  check('nor to step 1', canonical(sec) !== CANON(1), sec);
  check('it falls back to the learner\'s own wording, whole',
    canonical(sec) === null && sec.includes('the pulling of the numbers'), sec);

  for (const answer of ['The numbers and the inbox.',
                        'The pulling of the numbers and checking the inbox for anything I missed.']) {
    sec = await sectionFor(answer);
    check('"' + answer.slice(0, 40) + '..." does not select just one of its steps',
      canonical(sec) === null, String(canonical(sec)));
    check('and keeps what they said', sec.includes(answer.slice(0, 20)), sec);
  }

  // ======================= no reliable match: the fallback is intact =======================
  sec = await sectionFor('The routine parts, so I only review and adjust the result.');
  check('no meaningful match means no canonical line', canonical(sec) === null, String(canonical(sec)));
  check('and the answer stands as written', sec.includes('The routine parts, so I only review and adjust the result.'), sec);

  /* Words every neighbouring step shares - "update", "client" - are not evidence of
     any one of them. */
  sec = await sectionFor('The update for each client, the way it is now.');
  check('words shared between steps are not evidence of either', canonical(sec) === null, String(canonical(sec)));

  /* One distinguishing word alone is a coincidence, not a reference: "draft" can
     appear in a sentence that is not about the drafting step at all. */
  sec = await sectionFor('I want it to be a good draft.');
  check('a single stray word is not enough to name a step', canonical(sec) === null, String(canonical(sec)));

  // ======================= the same thing, through the real conversation =======================
  /* Everything above seeds the answer. This one gets there as a learner does: typed
     into Refine, captured, carried to Deploy - the path the original defect took. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await ctx.newPage();
    report.watch(page);
    await page.addInitScript(s => {
      localStorage.setItem('bw_started', '1');
      localStorage.setItem('brainstorm_workflow_data', s);
    }, JSON.stringify(seedState({
      steps: STEPS, toolsAll: ['Tableau', 'Gmail', 'Word', 'Slack'],
      botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
      progress: { current: 4, unlocked: 4, done: { 1: true, 2: true, 3: true }, entered: { 1: true, 2: true, 3: true } }
    })));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForTimeout(400);
    await page.click('.bw-station[data-stage="4"] .bw-station-card');
    await page.waitForTimeout(700);
    await page.click('[data-next="4"]');
    await page.waitForFunction(() => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= 1, null, { timeout: 12000 });
    const say = async (text, n) => {
      await page.fill('#bw-chat-input', text);
      await page.keyboard.press('Enter');
      await page.waitForFunction(k => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= k, n, { timeout: 15000 });
    };
    await say(sending, 2);
    await say('The call on what to flag to each client next week stays mine, and so does anything that changes what we promised them.', 3);
    await say('Four short paragraphs, no bullets, under two hundred words, a direct tone, and the same shape every week.', 4);
    await say('Never invent a number that is not in the export I paste in. Client names come from the CRM, never from memory.', 5);
    await page.locator('button:has-text("Save and continue")').click();
    await page.waitForTimeout(900);
    await page.click('#bw-lesson-next');
    await page.waitForTimeout(500);
    const prompt = await page.inputValue('#bw-prompt-v2');
    const real = prompt.split('## WHAT I NEED YOU TO DO\n')[1].split('\n## ')[0].trim();
    check('typed into the real coach, "Sending..." still never becomes Draft',
      canonical(real) !== CANON(3) && !/Draft a four paragraph/.test(real), real);
    check('and the section carries what they typed', real.includes('Sending each update out'), real);
    await ctx.close();
  }
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
