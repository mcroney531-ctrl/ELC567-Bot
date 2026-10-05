/*
 * The closing "HOW TO WORK WITH ME" section: one missing-information rule, with a stated order.
 *
 * Found by persona testing (P05, "Corinne"). The closing used to be two unconditional lines:
 *
 *   If something above is missing for a given run, ask me for it before you produce anything.
 *   Never invent ... - mark a gap as [MISSING: what you need] and keep going.
 *
 * They contradicted each other, and both competed with whatever the learner had already said about
 * missing information. Corinne's own rule - say "insufficient information" when her notes do not
 * support a response - survived verbatim, but a prompt that also says "ask first" and "keep going" no
 * longer tells an assistant which one governs. Two independent reviewers split on exactly that.
 *
 * The fix is a stated order, with no attempt to detect the learner's rule (that would be brittle NLP):
 * the learner's handling for that case first, the generic ask only when they gave none, and
 * "never invent" outside the conditional so no learner instruction can make it subordinate.
 *
 * These tests read the GENERATED prompt and the Deploy lesson, not a helper: the defect is in what
 * reaches the learner.
 */
import { serveSite, makeReporter, loadChromium, seedState } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('closing text');
const check = report.check;

const PORT = 8190;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const SETTLED = { handoff: true, keep: true, output: true, context: true };
const GOOD = {
  handoff: 'Draft the response to each query from my notes, and I review every one before it goes.',
  keep: 'Deciding whether a query is out of scope stays with me, and so does sending anything to the sponsor.',
  output: 'Two short paragraphs, plain language, no speculation, and the same structure every time.',
  context: 'Only state what is in my notes.'
};

async function openDeploy(answers) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  report.watch(page);
  const seed = seedState({
    botAnswers: { ...GOOD, ...answers, notes: [] },
    decided: SETTLED,
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
  const lesson = await page.locator('#bw-lesson-copy').textContent();
  await page.click('#bw-lesson-next');
  await page.waitForTimeout(500);
  const prompt = await page.inputValue('#bw-prompt-v2');
  await ctx.close();
  return { prompt, lesson, closing: prompt.split('## HOW TO WORK WITH ME\n')[1] || '' };
}

const ASK = 'If I gave none, ask me for the required information before completing the affected part.';
const DEFER = 'If information is missing or uncertain, follow any instructions I gave above for that case.';
const NEVER = 'In all cases, never invent facts, names, numbers, or quotes.';
const CONTINUE = 'You may continue with unaffected parts; if you show the affected part before I answer, clearly say what information is missing, for example [MISSING: what you need].';

try {
  // ---- a learner who states their own missing-information rule (P05 / Corinne) ----
  const RULE = 'If my notes do not support a response, say "insufficient information" and nothing else.';
  const own = await openDeploy({ context: RULE });
  check('her exact rule survives verbatim in the prompt', own.prompt.includes(RULE), own.prompt);
  check('and the closing defers to it, for that case', own.closing.includes(DEFER), own.closing);
  check('never-invent is unconditional: its own sentence, whatever else the learner said', own.closing.includes(NEVER), own.closing);

  // ---- a learner who gave no rule: the generic fallback ----
  const none = await openDeploy({});
  check('with no rule of their own, the generic fallback asks before completing the affected part', none.closing.includes(ASK), none.closing);
  check('and unaffected parts may continue, with the affected part clearly flagged as missing information (for example [MISSING: ...]) if shown before the answer', none.closing.includes(CONTINUE), none.closing);
  check('never-invent is unconditional here too', none.closing.includes(NEVER), none.closing);

  // ---- one procedure, in a stated order, no contradiction ----
  for (const [name, r] of [['with her own rule', own], ['with none', none]]) {
    check(name + ': no unconditional "keep going"', !/keep going/i.test(r.closing), r.closing);
    check(name + ': no unconditional "before you produce anything"', !/before you produce anything/i.test(r.closing), r.closing);
    check(name + ': exactly one ask instruction', (r.closing.match(/ask me for/gi) || []).length === 1, r.closing);
    check(name + ': the order is stated - the learner\'s handling comes before the generic ask',
      r.closing.indexOf(DEFER) !== -1 && r.closing.indexOf(DEFER) < r.closing.indexOf('ask me for'), r.closing);
  }
  /* The [MISSING] / partial-work behavior is part of the GENERIC fallback only. If it sat after the
     learner-rule deference as its own sentence, a prompt carrying a learner rule such as "say
     'insufficient information' and nothing else" could still be read as separately permitting partial
     work marked [MISSING]. So it is pinned structurally: deference, then the "if I gave none" fallback,
     then the partial-work/[MISSING] sentence, then the unconditional never-invent - in that order, with
     [MISSING] appearing once and only after the fallback clause begins. */
  for (const [name, r] of [['with her own rule', own], ['with none', none]]) {
    const c = r.closing;
    const iDefer = c.indexOf(DEFER), iNone = c.indexOf('If I gave none'), iCont = c.indexOf('You may continue with unaffected parts'),
      iMissing = c.indexOf('[MISSING:'), iNever = c.indexOf(NEVER);
    check(name + ': the generic ask, the partial-work permission and [MISSING] come after "If I gave none", never before it',
      iDefer !== -1 && iDefer < iNone && iNone < iCont && iCont < iMissing, c);
    check(name + ': [MISSING: ...] appears exactly once, inside the fallback, before the unconditional never-invent',
      (c.match(/\[MISSING:/g) || []).length === 1 && iMissing < iNever, c);
    check(name + ': nothing about [MISSING] or partial work appears before the fallback begins',
      !/\[MISSING|partial|continue with/i.test(c.slice(0, iNone)), c.slice(0, iNone));
    check(name + ': never-invent is the final sentence, unconditional, and not part of any "if" clause',
      c.trim().endsWith(NEVER) && !/\bif\b/i.test(NEVER), c);
  }
  check('never-invent sits outside the conditional: it is not part of the "if I gave none" sentence',
    !none.closing.includes(ASK.replace(/\.$/, '') + ' ' + NEVER.replace(/^In all cases, /, '')) &&
    none.closing.indexOf(NEVER) > none.closing.indexOf(ASK), none.closing);

  // ---- the vague-answer path is untouched, and the lesson teaches the two markers as different things ----
  const weak = await openDeploy({ context: 'Fine.' });
  check('a vague answer still earns [NEEDS DETAIL]', /\[NEEDS DETAIL/.test(weak.prompt), weak.prompt);
  check('and the closing still tells the assistant to ask about that section before producing',
    /too vague to act on/.test(weak.closing) && /wait for my answers before producing anything/.test(weak.closing), weak.closing);
  check('the Deploy lesson still says a marked gap is handled, not a failure',
    /isn't broken/i.test(none.lesson) && /stop and ask/i.test(none.lesson), none.lesson);
  check('and teaches a missing-information note such as [MISSING: ...] as a different thing, not required syntax: a run input that was not supplied',
    /such as \[MISSING: \.\.\.\]/.test(none.lesson) && /wording can vary/i.test(none.lesson) && /different thing/i.test(none.lesson) && /input that run needs was not supplied/i.test(none.lesson), none.lesson);
  check('and that it is not permission to guess', /not permission to guess/i.test(none.lesson), none.lesson);
  check('[NEEDS DETAIL] is not used for the runtime case', !/\[MISSING[^\]]*\][^.]*workflow decision/i.test(none.lesson), none.lesson);
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);
