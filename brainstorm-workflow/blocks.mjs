/*
 * The block list, in one place.
 *
 * build.mjs emits a file per entry, preview.mjs stacks the lesson ones in
 * order, and builder.mjs offers all of them in its dropdown. Everything that
 * needs to know what blocks exist reads this, so a block added here shows up
 * in all three without anyone remembering to update the other two.
 */

/* `rise` is the placeholder prompt shown where your own Rise copy goes -
   a description of the teaching that belongs there, not copy to ship. */
export const BLOCKS = [
  { file: '1-intro.html', role: 'intro',
    banner: 'BLOCK 1 - the hook, the outcome, and the worked example',
    title: 'The hook and the worked example',
    rise: 'Your opening Rise text: why this matters for their actual job.' },

  { file: '2-problem.html', role: 'problem',
    banner: 'BLOCK 2 - name the repetitive task',
    title: 'Name the repetitive task',
    rise: 'Rise text: what makes a good candidate task - frequent, rule-shaped, low-stakes to get wrong once.' },

  { file: '3-coach-workflow.html', role: 'coach-workflow',
    banner: 'BLOCK 3 - chat: describe the workflow, coach numbers it',
    title: 'Chat: walk me through the workflow',
    rise: 'Rise text: describe it the way you would to someone covering for you. Do not tidy it up first.' },

  { file: '4-coach-tools.html', role: 'coach-tools',
    banner: 'BLOCK 4 - chat: where each of those steps happens',
    title: 'Chat: where does each step happen',
    rise: 'Rise text: naming the tools is what stops the finished prompt being generic advice.' },

  { file: '5-draft.html', role: 'draft',
    banner: 'BLOCK 5 - the draft prompt, built from blocks 2 to 4',
    title: 'The draft prompt, built for them',
    rise: 'Rise text: this is a starting point, not the deliverable. Read it and notice what it still does not know.' },

  { file: '6-coach-handoff.html', role: 'coach-handoff',
    banner: 'BLOCK 6 - chat: which step should the AI take over',
    title: 'Chat: what should the AI take over',
    rise: 'Rise text: the difference between handing over a task and handing over a judgment call.' },

  { file: '7-coach-standards.html', role: 'coach-standards',
    banner: 'BLOCK 7 - chat: what a good result looks like, what stays yours',
    title: 'Chat: what does good look like',
    rise: 'Rise text: "make it professional" is not a specification. Examples of specs that are.' },

  { file: '8-coach-guardrails.html', role: 'coach-guardrails',
    banner: 'BLOCK 8 - chat: house rules, then hands back the prompt',
    title: 'Chat: house rules and what it must never invent',
    rise: 'Rise text: the day-one new hire test - what did you have to correct them on?' },

  { file: '9-artifact.html', role: 'artifact',
    banner: 'BLOCK 9 - the finished master prompt, editable and copyable',
    title: 'The finished master prompt',
    rise: 'Rise text: where to paste it, and what to do when the first result is not right.' },

  /* Not part of the default lesson: swaps for it, offered in the dropdown. */
  { file: 'alt-workflow-form.html', role: 'workflow', alt: true,
    banner: 'ALTERNATIVE - blocks 3 and 4 as one fill-in-the-cards form',
    title: 'Map the workflow (card form, replaces 3 + 4)',
    rise: 'Rise text: one action per card, plus where it happens.' },

  { file: 'alt-capture-combined.html', role: 'capture', alt: true,
    banner: 'ALTERNATIVE - the intro and blocks 2, 3, 4 and 5 in one block',
    title: 'Intro through draft prompt, in one block',
    rise: 'Rise text: framing for the whole first half.' },

  { file: 'alt-single-block.html', role: 'all', alt: true,
    banner: 'ALTERNATIVE - the whole activity in one block',
    title: 'The entire activity, one block',
    rise: 'Rise text: framing for the whole activity.' }
];

/* The lesson as it is meant to be assembled, in order. */
export const LESSON = BLOCKS.filter(b => !b.alt);
