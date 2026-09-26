# Restructure brief — AI Workflow Builder

**For:** GPT, working in this repo
**Repo:** `mcroney531-ctrl/ELC567-Bot`, branch `main`, deployed from `main`/root via GitHub Pages
**Date:** 2026-09-26
**State:** the reorder is done, deployed, and green at 491 assertions across nine suites.

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
2  Describe    describe    describe    below   "Complete · Process in view"
3  Map         map         map         above   "Complete · N steps mapped"   ← counts filledSteps()
4  Refine      refine      refine      below   "Complete · Coach review finished"
5  Deploy      deploy      deploy      above   "Complete · Master prompt ready"
```

Per-stage tables, all keyed by step number:

| Table | Line | Holds |
|---|---|---|
| `STAGE_CONTEXT` | 3087 | left-panel `framing` + `quote` |
| `STAGE_ART` | 3057 | the workspace illustration (keyed by `art`, not by number) |
| `STAGE_INFO` | 3117 | the info strip — only 1 and 4 have one |
| `STAGE_EXAMPLES` | 3102 | starter cards — only key `1`, which **no longer renders anywhere** (see §7) |
| `STAGE_LESSON` | 3573 | the reading |
| `STAGE_COACH` | 3462 | `{1: true, 4: true}` — which stages hand off to a coach |
| `STAGE_CONVO` | 131 | step → conversation key |

`statusOf(n)` (`2711`) derives all four presentation states from `progress` and nothing
else. Both the journey map and the mini-node strip call it. If you add a third surface
showing stage state, it calls `statusOf()` too — that invariant is asserted by test.

---

## 2. What the reorder changed

**Before:** Identify → Map(form) → Envision(auto-built draft prompt, read-only) → Refine(coach) → Deploy
**After:** Identify → Describe(reading) → Map(reading→form) → Refine(coach) → Deploy

Concretely:

- The two readings that were pages 1 and 2 of one lesson became two stages.
  `STAGE_2_LESSON` (3544) is "Describe the workflow in full"; `STAGE_3_LESSON` (3513) is
  "Map the workflow and tools". **Note the numbering is not the authoring order** —
  `STAGE_3_LESSON` is declared first because it was written first.
- The draft-prompt screen is **retired from the journey**. Its markup still lives in
  `#bw-panel-2` (`index.html`), behind a reading-only stage, so it never opens.
  `renderPromptV1()` still writes `#bw-prompt-v1` every render — that keeps
  `workflowData.masterPromptV1` current and keeps the `/role/draft` preview working.
- Accent token `envision` → `describe` across `css/tokens.css`, `css/stage.css`,
  `css/home.css`. There is no `envision` identifier left anywhere except inside the
  author's own prose in `STAGE_2_LESSON` ("Take a moment to envision each specific step"),
  which is intentional.

### The hazard: step numbers and stage names came apart

Step 2 is the reading, step 3 is the form. **Five places key off the step number and must
agree.** Change one, change all five:

| What | Where | Now says |
|---|---|---|
| `stepValid` | `1888` | `case 2: return true` (reading); `case 3:` filledSteps + tools |
| `warningFor` | `1903` | the form's warning is `case 3` |
| `GATES` | `1812` | `workflow` gate → step 3; `draft` gate → step 2; `artifact` needs `stepValid(3)` |
| `ROLES` | `71` | `workflow`/`coach-workflow`/`coach-tools` → `steps: [3]`; `draft` → `steps: [2]` |
| `render()` re-validation | `2003` | `[1, 3].forEach(...)` un-ticks stages that no longer validate |

Plus two smaller ones that also moved: `applyRole()`'s capture-chat relocation now targets
`#bw-panel-3`/`#bw-warn-3`, and `openStep()`'s `maybeStartConversation` trigger is
`n === 3 && isCaptureChat`.

---

## 3. The lesson content model

A lesson is typed blocks, rendered one node per type by `buildLessonBlock()` (`3308`).
Nothing goes through `innerHTML`.

```js
{ type: "h",    text }                          // the question a section answers
{ type: "p",    text }
{ type: "list", lead?, items: [] }              // bulleted
{ type: "defs", lead?, items: [{term, text, note?}] }   // the arrow pairs on stage 3
{ type: "turn", label, text }                   // the handoff, accented, sits above Continue
```

Two structural flags on a `STAGE_LESSON` entry:

- **`pages: [...]`** — a multi-page reading. A single-page lesson may be written as the
  page itself, which is what all three lessons do today. **So the multi-page path (the
  `1 of 2` counter, the Back button, `lessonPage` advance/retreat) is built, correct, and
  currently exercised by no content.** `lessonPages()` at `3585` normalises both shapes.
- **`work: false`** — the stage *is* the reading. `advanceLesson()` (`3272`) calls
  `goNext(n)` instead of revealing the panel. Only stage 2 sets it, and it matters
  specifically because stage 2's panel is the retired draft prompt — the one screen a
  learner must not see.

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
on whichever is open. `STAGE_CONVO` is `{1:"identify", 2:"describe", 3:"map", 4:"all",
5:"deploy"}` — **every stage needs an entry even without a coach**, because the fallback is
`"all"` and that would put stage 4's transcript on screen at stage 2.

**What the coach is given** — `contextInjection()` (`2164`): the problem, the numbered
steps, the tools. Not the V1 text. That's why retiring the draft screen cost the coach
nothing.

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

## 5. Building the 04 coach — the contract you'd be authoring against

This is the open build. The author's sketch, close to verbatim:

> Coach opens with something like *"Okay, so here's my understanding. \_\_\_\_\_ Here are a
> few ways that AI might be able to help in your process \_\_\_\_\_. What would the overall
> ideal scenario / end-game be for you? How do you envision splitting the
> responsibility(s)?"* … The ideas should be matched to master-prompt content — but the
> master prompt isn't shown to the learner; it's knowledge and context for the coach. We
> can provide some examples that match the integration examples we already gave:
> *"I want \_\_\_\_\_"*

Three moves in order: **reflect back → propose → ask for the ideal end-state and the split
of responsibility.**

### What the finished conversation has to produce

Stage 4 writes `workflowData.botAnswers`. Those keys are load-bearing — they become the
master prompt's sections via `SECTION_LABELS` (`1009`):

| key | becomes |
|---|---|
| `handoff` | `## WHAT I NEED YOU TO DO` |
| `output` | `## OUTPUT I EXPECT` |
| `keep` | `## WHAT STAYS WITH ME` |
| `context` | `## THINGS YOU NEED TO KNOW` |
| `notes[]` | folded into context |

`weakSections()` (`1018`) flags any of those that were answered thinly, and `paintV2()`
refuses to let the artifact look finished when they are. **If the new opening changes what
gets asked, it changes which of these keys get filled** — and an unfilled key shows as a
bracketed placeholder in the final prompt.

### How the conversation becomes the artifact

`STAGES.all.minTurns` is 2; `turnsNeeded()` (`1881`) gates the handoff card.
`coachingCards()` (`3694`) emits the `save-and-continue` card only when
`userTurns() >= turnsNeeded() && stepValid(current)`.

The coach's last reply should contain a fenced block. `parseMasterPrompt()` (`1139`)
accepts ` ```master-prompt `, ` ```prompt `, or an untagged fence whose body starts with
`##` / `MASTER PROMPT` / `CONTEXT`. `latestBotPrompt()` walks `PROMPT_STAGE_ORDER` (`1154`)
and the first block found wins; `computeV2()` sets `v2Source: "bot"`. No block → falls back
to `generateMasterPromptV2()` (`1097`) and `v2Source: "template"`. A learner's manual edit
sets `"user"` and beats both until an explicit rebuild.

### The asymmetry you have to design around

The "here are a few ways AI might help" move is the whole problem.

- **Live:** the model reads the actual tools and proposes real integrations. Works.
- **Scripted:** cannot invent. The honest ceiling is keyword-matching `workflowData.toolsAll`
  against the five pairs in `STAGE_3_LESSON`'s `defs` block (Spreadsheet→Email, PDF
  Reader→File Storage, File Storage→Calendar, Video Conferencing→Task System, Claude
  Connector→CRM) and naming the closest shape.

Since `botEndpoint` is `null`, **the scripted version is what ships today**. Designing only
for live means the deployed activity does something visibly weaker than the design.

---

## 6. Where AI actually appears

`STAGE_COACH = {1: true, 4: true}`. Stages 2, 3 and 5 have no conversation. Worth seeing
plainly: in an activity about AI, three of five stations are reading, a form, and a
textarea. That's the correct consequence of the decisions in §7, not a mistake — but it's
the kind of thing that's invisible from inside the build.

---

## 7. Decisions already made, with the reasoning

Settled unless someone argues. The reasoning is the part worth keeping.

**Stage 3 is a form, not a coach.** A conversational version exists and is wired out:
`SCRIPTS.workflow` / `SCRIPTS.tools`, `captureFromUser`, `splitIntoActions`,
`parseToolPairs`, `ACTION_REPLIES`, `TOOL_REPLIES`, `isConfirm`, `resolveStep` — ~350 lines
plus `test/capture-chat.test.mjs` (35 assertions). It is reachable **only** under
`isCaptureChat`, which requires `blockRole` to be `coach-workflow`/`coach-tools`. Production
runs `blockRole: "all"`, so it is dead in the deployed product.

It lost on merit: the output is structured data (ordered action/tool pairs) that everything
downstream generates from; a form makes all of it visible and editable at once; and
prose→records was a bug farm — *"oh and then I email it"* became a step named *"Oh and then
I email it"*, *"yes that looks right"* parsed as a new step. Both fixed, but that class of
bug is inherent and buys nothing here. Stage 3's own copy also tells the learner to
enumerate, which a numbered form *is* and a chat box actively works against.

**The master prompt is hidden until 05.** Showing a half-built prompt at the old stage 3
made the activity feel finished early and gave the learner something to fiddle with instead
of a question to answer.

**One claim was rescoped.** Stage 3 used to say *"Other times, AI might pick up on one or
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
| `#bw-panel-2`'s draft prompt | rendered every tick, never shown in the timeline; `/role/draft` previews it |
| `STAGE_EXAMPLES[1]` | written for stage 1's retired textarea; renders on no screen today |
| Multi-page lessons | machinery live, no content uses it |
| Coaching-card types `example`, `refinement` | render correctly from the typed shape; nothing emits them |
| `/role/<name>`, `/frames/<a,b,c>` | test-harness routes in `serveSite()`; **404 on Pages** |

`?admin=1` (or `/admin/`) is the opposite — live everywhere, deliberately. Skip / Fill all /
jump / lesson⇄chat toggle, for walking the activity without answering it. It writes only
through the functions a learner's clicks reach, and `test/admin.test.mjs` asserts the states
it produces are indistinguishable from real ones.

---

## 8.5. Superseded by the Map merge decision

**DECIDED (2026-09-26):** Describe is not a standalone stage. The Describe reading and the
Map reading are two halves of one cognitive move, and the form is its application, so they
become one Map stage: two lesson pages, then the existing form. The form stays a form; the
retired conversational workflow capture stays retired.

**SETTLED IN PRINCIPLE (2026-09-26):** five stages.

```
01 Identify   define the problem worth solving
02 Map        understand reality at tiny step + tool level
03 Envision   define the ideal outcome, then what AI does in that better version
04 Refine     turn that vision into responsibilities, standards, context, guardrails
05 Deploy     review, edit and use the finished prompt
```

Envision returns as a **future-state design stage**, not the retired draft-prompt screen.
That screen stays retired and the learner still sees no prompt before Deploy.

Two caveats on "settled in principle": the Describe + Map merge is not implemented yet, and
**Envision's exact interaction and data contract remain open.**

The architecture question no longer blocks the design conversation. The station count is
now derived from `STATIONS` rather than written down in a dozen places, so four and five
are both structurally viable and no implementation debt is voting for either.

### Envision — current design lean, not decided

Recorded so the next implementation pass knows the direction and knows it is a lean:

- **Reading → small form, not a coach.** Sidesteps the live-vs-scripted asymmetry entirely,
  and keeps the learner doing the imagining rather than asking AI to imagine for them.
- **Two questions.** *"Picture the better version — what would be different if this
  workflow worked exactly the way you wanted?"* then *"Where does AI fit — what would you
  want AI to do in that better version?"*
- **Output is new top-level learner data**, not `botAnswers`, because the learner produced
  it rather than a coach. Provisionally `idealOutcome` and `aiRole`, possibly only those two.
- **It reaches the final prompt transformed, not verbatim, and not as a new section.**
  `idealOutcome` informs `## CONTEXT` and `## OUTPUT I EXPECT`; `aiRole` informs
  `## WHAT I NEED YOU TO DO`. Refine then makes those intentions precise. The learner should
  be able to recognise their Envision thinking in the finished prompt.

The division of labour that falls out of this: **Envision says what the better workflow
should become; Refine makes it precise enough for an AI to operate inside.**

This supersedes questions 1 and 2 below, which asked about stage 2's name and whether it
earned a station. See `docs/design/map-merge-orientation.md` for the technical read of the
merge, and §5 of this file for the Refine coach contract that Envision would feed.

## 9. Open questions

Framed as decisions, with what each one costs in code.

1. **Station names.** `Describe` is a placeholder, as are its blurb ("Picture the process as
   it really is.") and quote ("The blueprint comes before the build.") — all three written
   in the build session, not authored. The five names are meant to read as transferable
   practice. Does the set still hang together with `Envision` gone?
   *Cost: `STATIONS`, `STAGE_CONTEXT`, the accent token trio in three CSS files, and the
   name assertions in `timeline` / `learning-stage` / `scripted-coach`.*

2. **Is stage 2 worth a station?** One screen of reading, equal weight on the map to stages
   with real work, and it ticks "Complete · Process in view" for being read. Leave it, fold
   it back into stage 3 as a first page, or give it something to do?
   *Cost of folding: delete the `STAGE_LESSON[2]` entry, move its blocks into a `pages`
   array on 3, and the five-places list in §2 again — in reverse.*

3. **How much should the design lean on the live coach?** (§5.) Design for live and accept
   the scripted version is a shadow; design something both can do honestly; or make the
   scripted coach's limits visible to the learner.

4. **The 04 opening and the "I want \_\_\_\_\_" starters.** Do you want to author these? The
   contract is §5. They should line up with the five `defs` pairs in `STAGE_3_LESSON`.

5. **A line that is now slightly wrong.** `STAGE_2_LESSON`'s `turn` block ends *"…write each
   specific step and behavior below."* The form is a Continue away, on stage 3 — not below.
   Kept verbatim rather than silently edited.

6. **Three phases vs five stages.** `index.html` Course Overview: *"structured around three
   phases: defining your problem and workflow, refining your approach through conversation,
   and exporting a production-ready prompt."* The map shows five. They reconcile
   (define = 1+2+3, refine = 4, export = 5) but a learner reads "three" and counts five.

7. **Two product names.** Landing: *"Brainstorm an AI-Powered Workflow."* Home: *"AI Workflow
   Builder — Turn Ideas Into Impact."*

8. **Theme split.** The landing is the last screen on the light lavender theme; home and
   every stage are the dark shell family.

9. **Lessons for 04 and 05.** No copy. Stages 1–3 have theirs.

---

## 10. Working in here

```bash
npm start     # http://127.0.0.1:8080   (and /admin/ for the review bar)
npm test      # nine suites, 491 assertions, ~3 min, stops at the first failing suite
node test/timeline.test.mjs    # iterate on one
```

| Suite | Asserts | Covers |
|---|---|---|
| `timeline` | 93 | map, four states, navigation |
| `learning-stage` | 92 | shell, mini strip, lessons, step-card geometry |
| `scripted-coach` | 90 | the whole walkthrough offline |
| `coach-phase` | 69 | the coach as a mode, per-stage transcripts, the pinned rail |
| `admin` | 47 | `?admin=1`, and that its states match real ones |
| `capture-chat` | 35 | the retired prose→structure parser |
| `live-endpoint` | 30 | the adapter, wire format, failures |
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
