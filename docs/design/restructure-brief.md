# Restructure brief — AI Workflow Builder

**For:** GPT, working in this repo
**Repo:** `mcroney531-ctrl/ELC567-Bot`, branch `main`, deployed from `main`/root via GitHub Pages
**Date:** 2026-09-27
**State:** the five-stage journey — Identify / Map / Envision / Refine / Deploy — is
implemented, deployed and green across thirteen suites. Run `npm test` for the current totals.
Refine's four-decision contract (§5) landed 2026-09-28.

This document was written when the journey was mid-restructure. It has been brought forward
to describe what is now built; where it records a decision and the reasoning behind it, that
is kept, because the reasoning is the part that is expensive to rediscover.

Line numbers are as of the current `main` and will drift — the identifiers won't, so grep
for those. `docs/HANDOFF.md` is the cold-start orientation for the whole codebase; this
document is only the reorder and what's open after it.

---

## 1. The journey, as data

Everything visible about a station comes from `STATIONS` (`js/activity.js:2683`). Position
in the array is the step number; `place` alternates and is the composition, not decoration.

```
#  name        accent      art         place   done() line
1  Identify    identify    identify    above   "Complete · Task defined"
2  Map         map         map         below   "Complete · N steps mapped"   ← counts filledSteps()
3  Envision    envision    envision    above   "Complete · Future state defined"
4  Refine      refine      refine      below   "Complete · Coach review finished"
5  Deploy      deploy      deploy      above   "Complete · Master prompt ready"
```

The count is not written down anywhere else. `stageNumbers()`, `stageCount()`,
`lastStage()` and `ownedSteps()` all read `STATIONS`, the rail's waypoints are
`(i + 0.5) * (100 / n)`, and the map's grid comes from `--station-count`. Adding or removing
a station touches none of the arithmetic; `test/station-count.test.mjs` serves the activity
one station short to prove it.

Per-stage tables, all keyed by step number:

| Table | Line | Holds |
|---|---|---|
| `STAGE_CONTEXT` | 3087 | left-panel `framing` + `quote` |
| `STAGE_ART` | 3057 | the workspace illustration (keyed by `art`, not by number) |
| `STAGE_INFO` | 3117 | the info strip — only 1 and 4 have one |
| `STAGE_EXAMPLES` | 3102 | starter cards — only key `1`, which **no longer renders anywhere** (see §7) |
| `STAGE_LESSON` | 3803 | the reading — stages 1, 2 (two pages) and 3 |
| `STAGE_COACH` | 3862 | `{1: true, 4: true}` — which stages hand off to a coach |
| `STAGE_CONVO` | 131 | step → conversation key |

`statusOf(n)` (`2711`) derives all four presentation states from `progress` and nothing
else. Both the journey map and the mini-node strip call it. If you add a third surface
showing stage state, it calls `statusOf()` too — that invariant is asserted by test.

---

## 2. How the journey got here

**Originally:** Identify → Map(form) → Envision(auto-built draft prompt, read-only) → Refine(coach) → Deploy
**Then, briefly:** Identify → Describe(reading) → Map(reading→form) → Refine(coach) → Deploy
**Now:** Identify → Map(reading ×2 → form) → Envision(reading → form) → Refine(coach) → Deploy

The middle structure lasted a day. Splitting the two readings into two stations put a stage
number between a reading and the work it set up, which is what made the step-number hazard
below a hazard. Merging them back was a data change: `STAGE_LESSON[2]` became a `pages` list
and the standalone station went.

What that leaves:

- **Map is `pages: [MAP_PAGE_THINK_SMALLER, MAP_PAGE_GET_SPECIFIC]` then the form.** Page one
  retitles the workspace (`title`/`sub` on the page); page two falls back to the stage's own
  heading. The two readings are one cognitive move — stop summarising, then get specific —
  and the form is its application.
- **Envision is `blocks: ENVISION_LESSON` then a two-field form** (`#bw-ideal-outcome`,
  `#bw-ai-role`). It is the only stage that captures the learner's own words without a
  conversation.
- **The draft-prompt screen is retired from the journey and out of the step list.** It lives
  in `<div class="bw-retired" id="bw-draft-wrap" hidden>` in `index.html`, revealed only by
  `/role/draft`. `renderPromptV1()` still writes `#bw-prompt-v1` every render, which keeps
  `workflowData.masterPromptV1` current and the preview honest. A walk of all five stages
  asserts no learner ever sees it.
- **The accent token `envision` is back**, and `describe` is gone, across `css/tokens.css`,
  `css/stage.css` and `css/home.css`.

### The hazard, and what is left of it

Step 2 now means Map's form and step 3 means Envision's two fields — the number and the
stage agree again. The **coupling** did not go away, though: five places key off the step
number and must be changed together.

| What | Where | Now says |
|---|---|---|
| `stepValid` | `2014` | `case 2:` `completeSteps() >= min` and no row half-written; `case 3:` `visionOK("idealOutcome") && visionOK("aiRole")` |
| `warningFor` | `2030` | the form's warning is `case 2`; the vision's is `case 3` |
| `GATES` | `1929` | `workflow` gate → step 2; `draft` gate → step 0 (out of the list); `artifact` needs `stepValid(1) && stepValid(2)` |
| `ROLES` | `72` | `workflow`/`coach-workflow`/`coach-tools` → `steps: [2]`; `draft` → `steps: []` |
| `render()` re-validation | `2131` | `[1, 2, 3].forEach(...)` un-ticks stages that no longer validate |

`test/journey-contract.test.mjs` exercises all five through the UI and names which one
drifted. Two smaller couplings moved with them: `applyRole()`'s capture-chat relocation
targets `#bw-panel-2`/`#bw-warn-2`, and `openStep()`'s `maybeStartConversation` trigger is
`n === 2 && isCaptureChat`.

Because `draft` now owns no step, two guards that used to test `!ROLE.steps.length` had to
change to `CONFIG.blockRole === "intro"` — otherwise the draft preview was misclassified as
the intro block and lost cross-block sync.

## 3. The lesson content model

A lesson is typed blocks, rendered one node per type by `buildLessonBlock()` (`3308`).
Nothing goes through `innerHTML`.

```js
{ type: "h",    text }                          // the question a section answers
{ type: "p",    text }
{ type: "list", lead?, items: [] }              // bulleted
{ type: "defs", lead?, items: [{term, text, note?}] }   // the arrow pairs on Map's page 2
{ type: "turn", label, text }                   // the handoff, accented, sits above Continue
```

Two structural flags on a `STAGE_LESSON` entry:

- **`pages: [...]`** — a multi-page reading. A single-page lesson may be written as the
  page itself, which is what stages 1 and 3 do. Map uses two pages, so the `1 of 2` counter
  and the Back button are live content now rather than untested machinery.
  `lessonPages()` normalises both shapes.
- **`work: false`** — the stage *is* the reading; `advanceLesson()` calls `goNext(n)` instead
  of revealing the panel. **Nothing sets it today.** It existed for the standalone Describe
  stage, whose panel was the retired draft prompt. That panel is now outside the step list
  entirely, which is a better guarantee than a flag.

`onLessonPage(n)` (`3598`) is "is reading", which is a **different question** from
`stageLesson(n)` ("has a lesson"). Both `renderLesson()` and `placeWorkspaceExtras()` need
the first. Getting this wrong left Save draft pinned to the lesson's action row after the
builder had taken over.

`lessonPage` is module state, like `view` and `phase` — not learner data. Entering a stage
resets it to 0, and `startPhaseFor()` repaints *after* the reset (the render that got you
there ran against the page you left on).

---

## 4. The coach subsystem

**Adapter** (`BotAdapters`, §4 of the file). One shape:
`{ id, live, label, send({system, context, messages}) -> Promise<string> }`.
`CONFIG.botEndpoint` (`12`) is `null`, so the **scripted coach is what ships and what
everyone reviews**. Live mode posts to the author's own proxy — there is never a provider
key in the page, and that constraint is stated in the source at `CONFIG.botHeaders`.

**One chat DOM, many conversations.** `sKey()` (`133`) returns
`STAGE_CONVO[progress.current]`, so the single chat component serves every stage by keying
on whichever is open. `STAGE_CONVO` is `{1:"identify", 2:"map", 3:"envision", 4:"all",
5:"deploy"}` — **every stage needs an entry even without a coach**, because the fallback is
`"all"` and that would put stage 4's transcript on screen at stage 2.

**What the coach is given** — `contextInjection()`: the problem, the numbered steps, the
tools, **and the learner's stated outcome and AI role**, plus an instruction not to propose a
vision of its own. Not the V1 text, which is why retiring the draft screen cost the coach
nothing. The scripted coach's opening (`mockOpening()`) reads the vision back
deterministically, so offline reviewers see the same handoff a live model would work from.

**Scripted script shape** (`SCRIPTS`, `1407`):

```js
key: {
  opening: function () { return "markdown string"; },
  turns: [ { capture: "<botAnswers key>", ackParas: 1, reply: function (userText) {...} } ],
  extra: function (note) { /* after turns are exhausted */ }
}
```

`mockCoachReply()` (`1613`) drives it: for turn *i*, if `answerQuality(text).thin` and we
haven't pushed back on that key yet, it stores the answer and returns
`PUSHBACKS[capture]` (`1590`). Second time through it accepts, but prefixes an honest
"I'll mark it as needing detail" and drops `ackParas` paragraphs off the front of the
reply so the acknowledgement doesn't contradict the `[NEEDS DETAIL]` mark.

---

## 5. Refine, as built

**DECIDED AND IMPLEMENTED 2026-09-28.** Refine has four required decisions, in this order,
and they are the stage's state model rather than a byproduct of chatting:

| # | key | rail label | becomes |
|---|---|---|---|
| 1 | `handoff` | What AI handles | `## WHAT I NEED YOU TO DO` |
| 2 | `keep` | What stays yours | `## WHAT STAYS WITH ME` |
| 3 | `output` | What good looks like | `## OUTPUT I EXPECT` |
| 4 | `context` | What AI needs to know | `## THINGS YOU NEED TO KNOW` |

`notes[]` stays optional and folds into context. `REFINE_DECISIONS` (`js/activity.js`) is the
single source of truth: the rail items, the scripted questions, the live coach's instruction
and `stepValid(4)` are all built from it.

**The gate is coverage, not turns.** `stepValid(4)` was `userTurns() >= 2`, so a learner could
take the handoff after two replies and arrive at Deploy with two sections never asked about.
It is now "all four decisions accepted". The rail names the four up front — transparency is
the feature: the learner can see the shape of the conversation and exactly what is left.

**Accepted is not the same as typed.** The first thin answer is stored, in case they stop
there, while the coach is still challenging it; only the second settles the decision, and it
is taken whatever it says, earning `[NEEDS DETAIL]`. Complete coverage, imperfect answers
allowed. `captureDecision()` holds the rule.

**One progression, two coaches.** The application owns which decision is current and when it
is satisfied. `captureDecision()` runs in `sendChat()` before any reply exists; the scripted
coach reads that state through `refineReply()`, and a live model is told about it through
`coachingState()` appended to `contextInjection()`. **This fixed a real hole**: the live path
captured nothing at all, so a coverage gate would have trapped a live learner in Refine
forever. No wire-contract change was needed — the state rides inside `context`.

**The conversation.** Opens on short excerpts of `idealOutcome` and `aiRole` (the coach still
receives them in full, invisibly), then walks the four in order, then recaps:

> You've defined the job, the boundary, the standard, and the rules.
> Continue to Deploy to review the finished prompt.

**No prompt before Deploy is now enforced, not requested.** The scripted fourth turn used to
print the finished `master-prompt` block inside Refine, and `BOT_SYSTEM_PROMPT` told the live
model to do the same — both in direct conflict with the locked rule. Now: the scripted coach
closes on the recap, the system prompt forbids it, and `stripPromptBlock()` removes any fenced
block from a Refine reply before the learner reads it. The guardrails slice and admin mode's
seeded prompt message went the same way.

A consequence: nothing in the journey emits a prompt block any more, so `v2Source` is always
`"template"`. Assembly from the four decisions is the normal path, and the note under the
prompt says where it came from rather than apologising for the coach. `latestBotPrompt()` and
the `"bot"` branch are unreachable in the full activity; deleting them is a separate decision.

### Voice (2026-09-28)

Authored, and the whole of it: the four questions, the acknowledgements, the push-backs, the
thin-answer line, the close, and the stage's surrounding copy. The target is **observant,
concise, specific, nonjudgmental** — a facilitator helping someone turn fuzzy intentions into
explicit decisions, not an assistant handing out approval.

What that ruled out, and why it is worth not reintroducing:

- **Praise the coach cannot back.** "That's the right instinct" fired identically whether the
  learner handed over the right step or the one they should have kept. The acknowledgements now
  record the decision: *"Got it — I'll treat X as the work AI should handle."*
- **Performance in the push-backs.** "That's a vibe rather than a spec" and "what would keep
  you up at night" were doing personality where they should have been teaching. Each push-back
  now restates the thing being asked for: *"Let's make that boundary concrete. What part still
  needs your judgment, approval, or final review — even if AI handles everything around it?"*
- **The system explaining itself.** The thin-accept line ran to two sentences about the prompt
  not looking more settled than it is. It is now one: *"I'll keep that answer, but I'm marking
  this part as needing more detail so you can spot it in Deploy."*
- **Reciting the worksheet.** The opening quoted the problem and listed every mapped step —
  both pinned in the cards directly above the transcript. It now picks up from the vision and
  asks.
- **Underselling the stage.** `COACH_FOCUS[4]` named two of the four decisions; the framing and
  quote were generic. All three now say what Refine is for.

The same voice rule is written into `BOT_SYSTEM_PROMPT`, so a live coach does not drift back
into approving of answers. The retired split-coach slices carried the two retired phrases and
were updated with them, so neither survives anywhere in the repo.

Settled, and not waiting on anyone: every line of Refine is authored. What is still open is
one move, not a copy pass — the "here are a few ways AI might help" idea is unbuilt, and the
live-vs-scripted asymmetry below is why.

## 6. Where AI actually appears

`STAGE_COACH = {1: true, 4: true}`. Stages 2, 3 and 5 have no conversation: Map is
reading→form, Envision is reading→form, Deploy is an artifact to read and edit. Worth seeing
plainly: in an activity about AI, three of five stations have no AI in them. That is the
correct consequence of the decisions in §7 — the learner does the thinking and AI helps make
it precise — but it is the kind of thing that is invisible from inside the build, so it is
written down rather than assumed to be obvious.

Worth adding after Refine's rebuild: even in the two stations that do have a coach, the
application owns the progression and what gets written down. The model phrases, reflects and
challenges. Nothing the learner ends up with depends on a model behaving.

---

## 7. Decisions already made, with the reasoning

Settled unless someone argues. The reasoning is the part worth keeping.

**Map is a form, not a coach.** A conversational version exists and is wired out:
`SCRIPTS.workflow` / `SCRIPTS.tools`, `captureFromUser`, `splitIntoActions`,
`parseToolPairs`, `ACTION_REPLIES`, `TOOL_REPLIES`, `isConfirm`, `resolveStep` — ~350 lines
plus `test/capture-chat.test.mjs` (35 assertions). It is reachable **only** under
`isCaptureChat`, which requires `blockRole` to be `coach-workflow`/`coach-tools`. Production
runs `blockRole: "all"`, so it is dead in the deployed product.

It lost on merit: the output is structured data (ordered action/tool pairs) that everything
downstream generates from; a form makes all of it visible and editable at once; and
prose→records was a bug farm — *"oh and then I email it"* became a step named *"Oh and then
I email it"*, *"yes that looks right"* parsed as a new step. Both fixed, but that class of
bug is inherent and buys nothing here. Map's own copy also tells the learner to
enumerate, which a numbered form *is* and a chat box actively works against.

**The master prompt is hidden until 05.** Showing a half-built prompt at the old stage 3
made the activity feel finished early and gave the learner something to fiddle with instead
of a question to answer. This is why Envision reaches the artifact **transformed** rather than
as a section of its own: the learner writes a future state, not a draft prompt.

**Refine's gate is coverage of four decisions.** Decided 2026-09-28. A turn count promised
nothing; four decisions promise exactly what the stage is for. The thin-answer rule keeps that
from becoming a demand for perfect answers, and the rail makes the requirement visible instead
of letting a learner discover it by being blocked. See §5.

**Envision is a reading and a form, not a coach.** Decided 2026-09-27. It sidesteps the
live-vs-scripted asymmetry in §5 entirely, and it keeps the learner doing the imagining
rather than asking AI to imagine for them. Its two answers are **top-level learner data**
(`idealOutcome`, `aiRole`) and not `botAnswers`, because `botAnswers` means "what a coach got
out of them" and these are the learner's own words. The read-back under the fields quotes
them verbatim; nothing paraphrases.

**One claim was rescoped.** Map's second page used to say *"Other times, AI might pick up on one or
present a workaround"* — which read as a promise about this activity's coach. It now reads
*"If you're brainstorming with AI in a session, the model might…"*. Consequence:
**spotting integrations is now unclaimed work.** The 04 sketch would re-promise it. Fine,
but deliberately.

---

## 8. Dead and unreachable, inventoried

Nothing here is broken; it's all reachable via preview routes or not at all. Listed so you
don't mistake it for live surface.

| Thing | Status |
|---|---|
| The capture-chat subsystem (above) | no production route; `/role/coach-workflow`, `/role/coach-tools` only |
| The retired draft prompt (`.bw-retired #bw-draft-wrap`) | rendered every tick, outside the step list, never shown in the timeline; `/role/draft` previews it |
| `STAGE_EXAMPLES[1]` | written for stage 1's retired textarea; renders on no screen today |
| `work: false` on a lesson | supported by `advanceLesson()`; no lesson sets it |
| Coaching-card types `example`, `refinement` | render correctly from the typed shape; nothing emits them |
| `/role/<name>`, `/frames/<a,b,c>` | test-harness routes in `serveSite()`; **404 on Pages** |

`?admin=1` (or `/admin/`) is the opposite — live everywhere, deliberately. Skip / Fill all /
jump / lesson⇄chat toggle, for walking the activity without answering it. It writes only
through the functions a learner's clicks reach, and `test/admin.test.mjs` asserts the states
it produces are indistinguishable from real ones.

---

## 8.5. The five-stage journey, as built

**DECIDED 2026-09-26, IMPLEMENTED 2026-09-27.**

```
01 Identify   define the problem worth solving              lesson -> coach
02 Map        understand reality at tiny step + tool level   lesson x2 -> form
03 Envision   define the ideal outcome, then AI's part in it lesson -> form
04 Refine     turn that vision into responsibilities,        lesson -> coach
              standards, context and guardrails
05 Deploy     review, edit and use the finished prompt       artifact
```

Describe is not a standalone stage: its reading and Map's reading are two halves of one
cognitive move, and the form is its application, so they are one stage with two pages. The
form stays a form; the retired conversational workflow capture stays retired. Envision returns
as a **future-state design stage**, not the retired draft-prompt screen — that screen stays
retired and the learner still sees no prompt before Deploy.

The division of labour this rests on: **Envision says what the better workflow should become;
Refine makes it precise enough for an AI to operate inside.**

### Envision, as implemented

- **Reading → two-field form.** `ENVISION_LESSON` is deliberately short: the thinking belongs
  in the answers, not in more prose. The one idea that has to survive any rewrite of it is the
  order — **outcome first, technology second**.
- **Two questions**, in that order: *"Picture the ideal outcome"* (what would be different if
  this worked the way you wanted — the end state, not the technology) and *"Define AI's role"*
  (what you would want AI to do to create that outcome, at the role level).
- **Stored as top-level learner data**: `idealOutcome`, `aiRole`. Not `botAnswers`.
- **Validated by the same thin-answer heuristic the coach uses** (`visionOK` → `answerQuality`),
  so "faster" and "idk" are refused but a learner is not held to an arbitrary character count.
  Both answers are required before Refine unlocks.
- **A deterministic read-back** under the fields quotes both answers, appearing only once both
  are real.
- **No AI call anywhere on the stage**, and no prompt visible on it.
- **It reaches the artifact transformed, in the six sections that were already there.** The
  outcome goes into `## CONTEXT` as `What I am trying to get to:` — it is what the work is
  for. The role goes under `## WHAT I NEED YOU TO DO` as `In broad terms:`, framing the task
  line rather than replacing it. **No seventh section, and no field label from the form appears
  in the output.** Both lines are conditional, which is why `generateMasterPromptV2()` is built
  as a list with `out.push()` rather than one concatenation.
- **Refine's coach is given both answers** through `contextInjection()`, with an instruction not
  to propose a different vision.

### Persistence: version 3

`defaultData().version` is `3`. `migrateV2()` upgrades a v2 payload rather than discarding it,
and `load()` writes the upgrade straight back so a learner who opens the page and leaves is not
left on the old shape. It carries authored work, `botAnswers`, `pushedBack` and every transcript
whose key still means the same conversation; starts the vision empty; and **re-derives
progression from the work itself** rather than copying it. A v2 learner who had finished the old
journey lands on Envision as *available*, not *current* — the upgrade does not pretend they have
been into a stage that did not exist. `test/envision-stage.test.mjs` holds this with a v2
fixture.

## 9. Open questions

Framed as decisions, with what each one costs in code. The ones the restructure answered are
recorded as answered rather than deleted, so nobody re-opens them by accident.

1. **Station names.** `Describe` is gone; the five are Identify / Map / Envision / Refine /
   Deploy, and they are meant to read as transferable practice. Envision's blurb ("Picture the
   better version.") and Map's ("Break the process into real steps.") were written in the build
   session, not authored — they are the remaining placeholders.
   *Cost of changing one: `STATIONS`, `STAGE_CONTEXT`, the accent token trio in three CSS
   files, and the name assertions in `timeline` / `learning-stage` / `journey-contract`.*

2. ~~**Is stage 2 worth a station?**~~ **Answered:** no — it was folded into Map as its first
   page. Done.

3. **How much should the design lean on the live coach?** (§5.) Still open. Design for live and
   accept the scripted version is a shadow; design something both can do honestly; or make the
   scripted coach's limits visible to the learner. Envision narrowed this a little: the coach no
   longer has to invent a future state, only to sharpen a stated one.

4. ~~**Refine's connective copy.**~~ **Answered:** all of it is authored and locked — the
   four questions, the acknowledgements, the push-backs, the thin-answer line, the recap and
   the surrounding stage copy. See the Voice section in §5. Still open, separately: the
   **"here are a few ways AI might help"** move is unbuilt, and would need to line up with
   the five `defs` pairs in `MAP_PAGE_GET_SPECIFIC`.

5. ~~**A line that is now slightly wrong.**~~ **Answered:** Map's `turn` block no longer sends
   the learner "below" — the form is past the reading in the same stage, and the copy says so.

6. ~~**Three phases vs five stages.**~~ **Answered:** the Course Overview now walks the same five
   stages the map shows, in the same order. `journey-contract` asserts the count and the order.

7. **Two product names.** Landing: *"Brainstorm an AI-Powered Workflow."* Home: *"AI Workflow
   Builder — Turn Ideas Into Impact."* Still open.

8. **Theme split.** The landing is the last screen on the light lavender theme; home and every
   stage are the dark shell family. Still open.

9. ~~**Lessons for 04 and 05.**~~ **Answered:** Deploy has one, written by the author.
   Refine deliberately has none — its interaction is the instruction, and a reading in front
   of the rail would make the learner read the same contract twice. Not a gap; do not add one
   for symmetry.

10. ~~**Does Deploy want a coach?**~~ **Answered:** no — it is a guided review (§5). The
    original note, for the record: `STAGE_CONVO` maps it to `deploy` and `STAGES` has an entry,
    but the stage is an artifact to read, edit and copy. Nothing is missing today; it is a
    question rather than a gap.

## 10. Working in here

```bash
npm start     # http://127.0.0.1:8080   (and /admin/ for the review bar)
npm test      # fourteen suites, ~6 min, stops at the first failing suite
node test/timeline.test.mjs    # iterate on one
```

| Suite | Asserts | Covers |
|---|---|---|
| `learning-stage` | 105 | shell, mini strip, multi-page reading, lessons, step-card geometry |
| `scripted-coach` | 96 | the whole walkthrough offline |
| `timeline` | 94 | map, four states, navigation, per-station accents |
| `chat-stage` | 70 | the coach as a mode, per-stage transcripts, the pinned rail |
| `deploy-stage` | 50 | stage 5's review-first flow, the provenance map, ownership on request, finishing as a learning state |
| `refine-stage` | 82 | stage 4's four decisions, coverage as the gate, live parity, the v3 upgrade, no prompt before Deploy in behaviour or in copy |
| `envision-stage` | 53 | stage 3 end to end, the carry into Refine and Deploy, the v2→v3 upgrade |
| `admin` | 49 | `?admin=1`, and that its states match real ones |
| `journey-contract` | 42 | the journey the learner is told about, and the five coupled step-number definitions |
| `capture-chat` | 35 | the retired prose→structure parser |
| `live-endpoint` | 32 | the adapter, wire format, failures |
| `station-count` | 25 | that the journey's length is data |
| `answer-quality` | 21 | thin-answer heuristics |
| `hardening` | 14 | charset, clipboard fallbacks, dark mode, two-press confirms |

House conventions that will bite otherwise:

- **`.bw [hidden] { display: none !important }`** in `tokens.css`. View and phase toggling
  must happen in JS. CSS attempts fail silently.
- **Grep before naming a `.bw-*` class.** Three collisions so far; the last one
  (`.bw-card-num`, shared between journey stations and workflow step cards) tore the step
  number out of its grid at every width and no suite caught it, because the damage was in a
  different component than the rule.
- **`activity.js` is ES5 inside the IIFE** — `var`, `function`, no arrows or template
  literals. Tests are modern ESM.
- Tests that need a stage's workspace call `readLesson(page)` from `test/helpers.mjs`, which
  clicks to the end of the reading rather than counting Continues.
- Commit straight to `main`. Every push deploys.
