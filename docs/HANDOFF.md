# Handoff — AI Workflow Builder (ELC567-Bot)

Written for a Claude session starting cold on this repository with no prior context.
Kept current on `main`; `git log -- docs/HANDOFF.md` shows when it last changed.

Everything below is verifiable from the code. Where something is a judgement call, an
open question, or a known wart, it says so.

---

## 0. Orientation in sixty seconds

This is a **single-page, vanilla HTML/CSS/JS web app** — no framework, no build step, no
bundler. It is an instructional activity that walks a learner from "a task that eats my
Monday" to "a master prompt I can paste into an LLM this afternoon."

- Served as a **static site from the repository root**. `index.html` is the entry point.
- Deployed by **GitHub Pages from `main` / root**. Every push to `main` deploys.
- Intended to be **embedded in an Articulate Storyline slide** from its own URL.
- All application logic is **one IIFE** in `js/activity.js` (~3,640 lines, ten numbered
  sections).
- **Commit straight to `main`.** The user asked for this explicitly on 2026-09-22. Do not
  create a feature branch unless asked. (If a session-level instruction names a
  `claude/...` branch, that instruction is stale — confirm with the user, but `main` is
  what they want.)

```bash
npm start     # http://127.0.0.1:8080 — plain static server
npm test      # eight Playwright suites, 397 assertions, ~3 min
```

`npm test` runs the suites **sequentially** and **stops at the first failing suite**
(they are chained with `&&`). If you are iterating, run the single suite you broke
directly: `node test/timeline.test.mjs`.

---

## 1. Repository layout

```
index.html              markup only, no inline styles or scripts (~464 lines)
css/
  tokens.css            palette + motion tokens, all scoped under .bw
  activity.css          shared components (typography, buttons, cards, chat bubbles)
  timeline.css          which of the three views shows; landing start button; back bars
  home.css              the dark journey map
  stage.css             the learning stage (dark shell, light workspace)
  chat.css              the coach phase
img/
  explainer/            ten explainer cards (268x543 PNG) from the user's artwork package
js/
  activity.js           the entire application, one IIFE
  vendor/gsap.min.js    vendored from the user's ELC564-StyleGuide repo
test/
  helpers.mjs           serveSite, withConfig, makeReporter, waitBots, seedThroughStage3
  coach-stub.mjs        fake LLM endpoint for the live-adapter suite
  serve.mjs             the dev server behind `npm start`
  *.test.mjs            eight suites (see §7)
personas/               offline persona-run harness (see §9)
docs/design/            three design packs the user supplied, committed verbatim
docs/HANDOFF.md         this file
README.md               user-facing overview
```

**Stylesheet order matters** and is fixed in `index.html`:
`tokens → activity → timeline → home → stage → chat`. Later files assume the earlier
ones. `gsap.min.js` loads before `activity.js`.

---

## 2. The product: three views, five stages, two phases

### Three views
Exactly one is on screen at a time. The view is **not** learner data — it lives in a
module-scope `view` variable and a separate `localStorage` key.

| View | Section id | What it is |
|---|---|---|
| `landing` | `#bw-landing` | Title, Course Overview, Learning Objectives, Start button, collapsed worked example |
| `map` | `#bw-map` | **Home.** The journey map: five stations on a spine |
| `stage` | `#bw-stage` | The learning stage — one stage's workspace |

Flow: `landing` → (Start) → `map` → (click a station) → `stage`. After the first Start,
reloading lands on `map`; the landing stays reachable via the back arrow (`#bw-to-landing`).

> **Critical implementation detail.** View toggling is done in **JS via the `hidden`
> attribute**, not CSS. `css/tokens.css` contains `.bw [hidden] { display: none !important }`,
> which beats any view CSS you could write. `setView()` sets `.hidden` on all three
> sections. If you try to show/hide views from CSS it will silently fail.

### Five stages
Stage *n* corresponds one-to-one with legacy step *n*. The `STATIONS` array
(`js/activity.js` ~line 2671) is the single source of each stage's name, accent, artwork,
placement above/below the spine, blurb, and its deterministic completion line.

| # | Name | Accent | Place | Completion line |
|---|---|---|---|---|
| 1 | Identify | `identify` | above | `Complete · Task defined` |
| 2 | Map | `map` | below | `Complete · N steps mapped` (counts real steps) |
| 3 | Envision | `envision` | above | `Complete · Ideal outcome defined` |
| 4 | Refine | `refine` | below | `Complete · Coach review finished` |
| 5 | Deploy | `deploy` | above | `Complete · Master prompt ready` |

Completion copy is **always computed from structured state, never from typed text**. This
is deliberate and tested.

Each home card shows three lines: the name, a status line and the stage's blurb. The status
line only ever shows state: `Upcoming` (locked), `Ready to start`, `In progress`, or the
completion line. Why a locked stage is shut ("Finish Map first") lives in the card's
`aria-label` and the hint line under the map, not on the card.

**Home's look** follows an inspo image the user supplied on 2026-09-23: frosted-glass
cards, a glowing wavy spine, and circuit-board scenery. The scenery is three inline
`svg.bw-circ` blocks at the top of `#bw-map`, all decorative and `aria-hidden`. The wave
depth is set in two places that must agree: `RAIL_Y` in `drawRail()` and `--wy` in
`css/home.css`. The comment beside `--wy` has the arithmetic.

**Home is a fixed 16:9 frame, scaled to fit, like a Storyline slide.** Everything in
`#bw-map` sits inside `#bw-map-frame`, which is laid out at 1280×720 (1920×1080 at two
thirds). `fitMap()` scales the frame to fit the page width and the window height minus
the footer, then centres it. It runs on `setView("map")` and on resize. Consequences:
- There is **no narrow layout for home**. A phone gets the same picture, smaller; on a
  portrait phone it is letterboxed and small, and landscape is much better. This was
  the user's call, on 2026-09-23.
- On home, `setView()` sets `data-bw-view="map"` on `<html>`, and `home.css` uses it
  to make the browser's page dark and margin-free. The map fills the window, the
  frame is centred in it both ways (letterboxed), and the footer sits at the bottom.
  No white page shows and nothing scrolls. The other views leave the page alone.
- Nothing inside the frame may size itself off the viewport (`vw`, `vh`, or media
  queries), because the viewport is not what it is drawn in.
- **Never `clearProps: "all"` on `#bw-map`.** It wipes the inline height and
  `--map-scale` that `fitMap()` sets, and the map collapses to zero height. Clear only
  what was animated (`"opacity,transform"`).

### Two phases inside a stage
`phase` is `"lesson"` or `"chat"`, mirrored onto `el.root` as `[data-phase]`.

- **lesson** — instructional content. For a stage with an entry in `STAGE_LESSON`, this is
  a heading + prose + one action row and *nothing to fill in*. For a stage without one, it
  is that stage's original panel (the textarea, the workflow card builder, etc.).
- **chat** — the AI coach.

`Continue` moves lesson → chat on a coaching stage; the coach's own **Save and continue**
card moves on to the next stage.

`startPhaseFor(n)` decides which phase a stage opens on:
```js
setPhase(stageHasCoach(n) && convoLen > 1 ? "chat" : "lesson");
```
`convoLen > 1` means "the learner has actually said something" — one message is just the
coach's opening. So a part-way conversation resumes; a fresh or cleared one replays the
lesson.

---

## 3. State model

### The single source of truth
```js
workflowData = {
  version: 2,
  problem: "",                       // stage 1's output
  steps: [{ action, tools }, ...],   // stage 2's output, min 2 filled
  toolsAll: [],                      // deduped across steps
  masterPromptV1: "", masterPromptV2: "", v2Source: "",  // "bot" | "template" | "user"
  conversations: { all: [], identify: [], workflow: [], tools: [], envision: [],
                   deploy: [], handoff: [], standards: [], guardrails: [] },
  mockProgress:  { ...same keys, all 0 },   // scripted-coach turn cursor
  botAnswers: { handoff, output, keep, context, notes: [] },
  pushedBack: {},                    // one push-back per question, so nobody loops
  progress: { current: 1, unlocked: 1, done: {}, entered: {} }
}
```

Persisted to `localStorage` under `CONFIG.storageKey` = `"brainstorm_workflow_data"`.
Writes are debounced 250 ms (`save()` → `writeNow()`).

Whether the learner has started is a **separate key**, `bw_started` — where someone is
looking is not learner data, and the state engine has no business knowing about it.

### The four-state lifecycle
One function, `statusOf(n)`, derives every visual state on both the journey map and the
mini-node strip:

```js
function statusOf(n) {
  var p = workflowData.progress;
  if (p.done[n])                      return "completed";
  if (n > p.unlocked)                 return "locked";
  if (p.entered[n] && n === p.current) return "current";
  return "available";
}
```

`progress.entered` is the fact that separates **available** from **current**: a stage
someone has opened and not finished is in progress. Without it, a fresh map would show
stage 1 as current before anyone touched it.

**There is one state model and two screens read it.** That is the point, and it is
asserted by test rather than left to convention. If you add a third surface that shows
stage state, it calls `statusOf()` too.

### Identity vs state — do not merge these
- **Identity** ("which stage is this") lives in `[data-accent]` and never changes.
- **State** ("what can they do right now") lives in `[data-state]`.

State *layers on top of* identity; it never replaces it. Consequences that are easy to
break by accident:
- The connector between stations stays **one neutral colour**. No rainbow segments, no
  progress fill. State belongs to the nodes and cards, never the line.
- A completed stage's star takes **that stage's own deepened colour**, never one gold for
  all.
- Completed is **not disabled** — a finished stage stays enterable.
- The learning stage's shell, workspace and context panel backgrounds are **identical
  across all five stages**. Only the number, illustration, progress fill and CTA carry the
  accent. This is tested by comparing computed styles across two stages.

### Self-correction on render
`render()` un-ticks stages 1 and 2 if their stored `done` no longer validates:
```js
[1, 2].forEach(function (n) {
  if (workflowData.progress.done[n] && !stepValid(n)) workflowData.progress.done[n] = false;
});
```
A stored tick is never taken at its word.

---

## 4. The coach

### Adapter pattern
`BotAdapters` (§4 of activity.js) exposes one shape:
```js
{ id, live, label, send({ system, context, messages }) -> Promise<string> }
```

- **`CONFIG.botEndpoint = null`** (current) → the built-in **scripted coach**. Fully
  usable, no backend.
- **`CONFIG.botEndpoint = "<url>"`** → the live adapter POSTs
  `{ system, context, messages: [{role: "user"|"assistant", content}] }` and normalises
  the reply from any of `{reply}`, `{message}`, `{content}`, `{text}`, Anthropic
  `{content:[{type:"text",text}]}`, or OpenAI `{choices:[{message:{content}}]}`.

> ### SECURITY — do not violate this
> From `CONFIG.botHeaders`, verbatim in the source:
> **"Never put a provider API key here — this file is public to every learner."**
> The endpoint must be the user's own proxy or serverless function. The page is served
> from GitHub Pages to every learner; anything in it is public. If asked to "just add the
> key to test it," say no and offer the proxy.

Timeout is `CONFIG.botTimeoutMs` (45 s) via `AbortController`. Failures surface an inline
error with a retry button and a fallback path ("Step 5"), and re-enable the composer.

### One chat DOM, many conversations
The timeline shows one stage at a time, so **one chat component serves all five
conversations** by keying on whichever stage is open:

```js
var STAGE_CONVO = { 1: "identify", 2: "workflow", 3: "envision", 4: "all", 5: "deploy" };
function sKey() {
  if (!TIMELINE) return STAGE;                        // a /role/ slice has one fixed stage
  return STAGE_CONVO[workflowData.progress.current] || "all";
}
function sMeta() { return STAGES[sKey()] || STAGES.all; }
```

`sKey()` replaced the old fixed `STAGE` in `activeScript()`, `mockProgress`,
`turnsNeeded()`, `pushedBack`, `restartConversation()` and `startPhaseFor()`.

**The transcript must be repainted when the open stage changes.** `startPhaseFor(n)` calls
`renderChatLog()` first, for exactly this reason. Forgetting it was a real bug: stage 4
showed stage 1's messages.

Relatedly, `startConversation()` captures `sKey()` before its 550 ms scripted-opening
timer and bails if the learner has navigated away — otherwise the opening lands in
whichever conversation happens to be on screen.

### The chat markup moves once, at wire time
`#bw-chat-wrap` lives inside the step panel in the markup, so a single-stage slice works
without any of the timeline machinery. `moveChatIn()` relocates it into `#bw-chat-panel`
**once, during wiring** — carrying its listeners, the adapter, the transcript and the
scripted coach with it.

Do **not** move it on phase change. That was tried; it left the conversation half-visible
under the lesson and was masking a false pass in the `live-endpoint` suite.

### Which stages have a coach
```js
var STAGE_COACH = { 1: true, 4: true };
```
Stages absent from this map run lesson-only and Continue goes straight onward.

### Stage 1's coach writes the problem statement
Because stage 1 has no form any more, its conversation is how `workflowData.problem` gets
written. `captureProblem(raw)` returns `{kind}` — one of `none | thin | confirm | first |
more` — and `identifyCoachReply()` renders a reply per kind.

Two subtleties worth preserving:
- A **thin first answer is kept** (in case they stop there) but **replaced**, not appended
  to, by the real one. Appending produced `"nope Every Monday I…"`.
- **Starting the conversation over clears `workflowData.problem`.** Otherwise the coach
  asks for the task again while the old answer quietly survives underneath.

### The handoff card
`coachingCards()` emits typed card data; `buildCoachingCard()` is the single renderer.
Two types are backed by real state (`problem-summary`, `specificity`), and `next-step`
carries the `save-and-continue` action.

```js
if (userTurns() >= turnsNeeded() && stepValid(workflowData.progress.current)) { ... }
```
The `stepValid` half matters: on a stage whose warning box lives behind the hidden lesson
screen, this card is the **only gate a learner ever sees**, so it must not offer a move
that `goNext()` would refuse.

### Prose → structured parsing
Stage 2's capture chats turn prose into a numbered list. Key functions:
`splitIntoActions`, `parseToolPairs`, `tidyAction`, `isConfirm`, `resolveStep`.

Two bugs already fixed here, worth not reintroducing:
- `ACTION_PREFIX` stripped only *one* leading filler word, so "oh and then I email it"
  became a step literally named "Oh and then I email it". It now loops until stable.
- A whole-string `CONFIRMS` regex failed on trailing words, so "yes that looks right" was
  parsed as a new workflow step. `isConfirm()` now requires an affirmative lead **and** a
  remainder of only affirmative words — so "yes, but step 2 is wrong" is still an edit.

---

## 5. The master prompt

Two artifacts, both generated, both overridable:

- **V1** (`generateMasterPromptV1`) — built template-style from `problem`, `steps` and
  `toolsAll`. Shown read-only in stage 3.
- **V2** (`generateMasterPromptV2`) — the finished prompt. Preferred source is the coach's
  own fenced block, lifted by `parseMasterPrompt()`; falls back to a template build.

Section headings, fixed:
`## CONTEXT`, `## WHAT I NEED YOU TO DO`, `## WHAT STAYS WITH ME`, `## OUTPUT I EXPECT`,
`## THINGS YOU NEED TO KNOW`.

`v2Source` tracks provenance (`"bot" | "template" | "user"`). A **manual edit wins** and
survives reload; regenerating requires an explicit two-press confirm on `#bw-regen-v2`.

`answerQuality()` marks thin answers so the artifact is honest about what it is missing
rather than looking equally finished either way.

---

## 6. The `/role/` slice system (legacy, still live)

`CONFIG.blockRole` selects which slice of the activity a page renders. It exists because
the original delivery pasted this app into nine Articulate Rise custom blocks that shared
state through `localStorage`.

`TIMELINE = CONFIG.blockRole === "all"` — the journey map, learning stage and coach phase
**only exist when `TIMELINE` is true**. Every entry point into that machinery is guarded.

Roles: `all`, `intro`, `capture`, `problem`, `workflow`, `coach-workflow`, `coach-tools`,
`draft`, `coach-handoff`, `coach-standards`, `coach-guardrails`, `artifact`.

`ROLES[role].steps` decides ownership; `OWNED_FIELDS` decides which top-level fields a
role may write back. `mergedForWrite()` writes a role's own fields on top of whatever
siblings have saved since — that is what stops blocks trampling each other.

**Status:** the Rise delivery is retired, but the slice system is intact, tested and
genuinely useful for working on one stage in isolation (`/role/problem`). Do not rip it
out without asking. If you touch shared code, keep the `TIMELINE` guards.

---

## 7. Tests

Eight Playwright suites, **397 assertions**, all passing.
(The counts below are what each suite reports when it runs, which is authoritative —
grepping for `check(` undercounts, because some assertions span lines.)

| Suite | Asserts | Covers |
|---|---|---|
| `scripted-coach.test.mjs` | 80 | Full walkthrough on the scripted coach: gating, the builder, V1, the conversation, V2 capture, persistence, copy, reset, mobile |
| `timeline.test.mjs` | 87 | Journey map: five stations, four states, navigation rules, the connector, responsive |
| `learning-stage.test.mjs` | 69 | Dark shell / light workspace, mini-node strip, the constant-shell rule, lesson vs panel stages |
| `chat-stage.test.mjs` | 61 | Coach phase as a mode not a second app; stage 1 lesson→coach; per-stage transcripts |
| `capture-chat.test.mjs` | 35 | Prose→structured parsing for workflow and tools |
| `live-endpoint.test.mjs` | 30 | The live adapter: request shape, history format, headers, errors, retry, timeout |
| `answer-quality.test.mjs` | 21 | Thin-answer heuristics and push-backs |
| `hardening.test.mjs` | 14 | Charset, no blocking modals, OS dark mode, clipboard fallbacks, two-press confirms |

### The harness
`serveSite(port, overrides)` is a **real directory server**, not a string fixture. Two
routes worth knowing:
- `/role/<name>` — renders one slice. Injects `<base href="/">` so relative assets resolve.
- `/frames/<a,b,c>` — several slices side by side **on the same origin**, so they can see
  each other's `localStorage`. A harness on another port would be cross-origin and could
  do neither.

`withConfig(overrides)` rewrites `CONFIG` in the served copy of `activity.js` — that is
how a suite points the app at the stub endpoint.

`seedThroughStage3(page)` seeds `localStorage` via `addInitScript` so a suite can open at
stage 4 without walking the whole activity. Used by `live-endpoint`, because stage 1 now
has its own live coach whose calls would otherwise land in the request log those
assertions read.

### Writing tests here
- Assert on **behaviour and state**, not on colours, sizes or illustrations. The artwork
  is explicitly placeholder and meant to be redrawn.
- Prefer driving the real UI over poking `localStorage`. Seeding is for reaching a state,
  not for asserting one.
- `waitBots(page, n)` waits for *n* settled bot messages (`.bw-msg-bot:not([data-typing])`).
- Beware: a **save-on-exit flush runs during reload**, so writing `localStorage` and then
  calling `page.reload()` gets your write overwritten by the in-memory state. Drive the
  app instead.

---

## 8. Motion

GSAP is vendored. Motion tokens live in `css/tokens.css`:
`--bw-duration-micro | -system | -hero`, `--bw-ease-standard | -out`.

`prefers-reduced-motion` is honoured **everywhere**, and tested. The pattern throughout is:
```js
function motionOff() { return prefersReducedMotion() || typeof window.gsap === "undefined"; }
if (motionOff()) { doItInstantly(); return; }
```
Reduced motion is never a degraded experience — the pulse becomes a static heavier ring,
the enter-stage choreography becomes an instant navigation.

Where motion is spent: Start (landing → map, with stations drawing along the spine),
entering a stage, and lesson → chat. Nowhere else.

---

## 9. The personas harness

`personas/` is an **offline** harness, separate from the test suite. `personas.mjs`
defines complete runs (a clean specific learner, a vague one, one who tries to hand over
the judgment they must keep). `run.mjs` drives them headlessly, `report.mjs` writes them
up, `library-page.mjs` builds a self-contained browsable copy.

This is where the answer-quality heuristics came from — persona testing found the activity
would hand someone who answered "just make it good" a prompt that looked exactly as
finished as one built from real answers.

Not run by `npm test`. Run it when you change coach behaviour or prompt generation.

---

## 10. Known state, open work, and warts

### Done and stable
- Landing → map → stage navigation, with GSAP transitions and reduced-motion paths.
- The journey map, four-state lifecycle, deterministic completion copy.
- The learning stage shell, mini-node strip, constant-shell rule.
- The coach phase as a mode inside the stage.
- Stage 1: lesson screen (lorem ipsum) → coach → handoff.
- Stage 2's builder, V1 generation, stage 4's coach, V2 capture, stage 5's artifact.

### Open work, roughly in priority order

1. **Lessons for stages 2, 3 and 5.** `STAGE_LESSON` has only stage 1. The others still
   show their original panels. Adding one is a one-line entry plus prose:
   ```js
   var STAGE_LESSON = { 1: { paras: LOREM, card: "plan" } };
   ```
   `card` is optional and names an entry in `EXPLAINER_CARDS` (path + alt text). Ask
   the user which card goes with which lesson rather than guessing. All the machinery (`renderLesson`, `placeWorkspaceExtras`, the Continue wiring) is
   already general.

2. **Real lesson copy.** Stage 1's is lorem ipsum, explicitly a placeholder the user will
   replace. Do not write instructional copy for them without asking.

3. **Stage 2's coach.** The `workflow` and `tools` capture scripts exist and
   `STAGE_CONVO` maps stage 2 → `workflow`, but stage 2 is **not** in `STAGE_COACH` and
   there is no combined workflow-then-tools script for a single conversation. This is the
   main unfinished piece of the coach story.

4. **Stages 3 and 5 are outputs, not conversations** (a draft prompt and a final
   artifact). `STAGE_CONVO` maps them to `envision` and `deploy` and `STAGES` has entries,
   but whether they should have a coach at all is an open design question. Ask.

5. **Three unused coaching-card types** (`example`, `refinement`, and the specificity
   checklist) render correctly from the typed shape, but nothing emits them.

6. **Chat scroll behaviour.** The chat-interface pack asks for "don't fight a learner who
   has scrolled up." Not implemented — `scrollChat()` always scrolls to the bottom.

7. **`STAGE_EXAMPLES[1]` has no screen to render on.** Those three starter examples were
   written for stage 1's textarea, which is gone. The machinery still works for any panel
   stage. Left in place deliberately rather than deleted or relocated — it is the user's
   copy.

### Lesson artwork
While a lesson is on screen, its explainer card (`img/explainer/`) replaces the SVG
stage icon in the left context panel. In the coach phase, and on stages with no lesson,
the icon comes back, so there is one picture at a time. `showLessonCard()` does the
swap with `hidden` and is called from both `renderLesson()` and `setPhase()`. The
cards contain words, so their alt text is those words; the SVG icon stays
`aria-hidden`. The cards are raster art with small type, so they are never drawn wider
than their native 268 px.

The user's package (`ai_workflow_vector_assets_package.zip`) also had three icon
sets: soft vector, connected app and minimal process. **Those were not committed.** The
package cut every board on the explainer board's five-column grid, but those boards
use other layouts, so about a dozen tiles are clipped at the edges. Re-cut them from
the boards before using any of them.

### Copy and naming inconsistencies flagged to the user, not yet resolved
- The landing says **"Brainstorm an AI-Powered Workflow"**; home says **"AI Workflow
  Builder / Turn Ideas Into Impact"**.
- The Course Overview says **"three phases"** while the map shows **five stages**. They do
  reconcile (define = Identify + Map, refine = Envision + Refine, export = Deploy) but a
  learner reads "three" and counts five.
- **Theme:** the landing is the last screen still on the light lavender theme; home and
  the stage are the dark shell family. Open question, not a bug.

### Mobile
No horizontal overflow at 360 px on any view, and that is tested. Home scales as one
frame (see §2); the landing and the stage still reflow. But the **coach header
wraps badly at 390 px** — the coach name stacks, the badge collides, and `#bw-coach-restart`
is pushed off. Pre-existing, cosmetic, not covered by an assertion.

### Environment note
The git proxy in the Claude Code remote environment **rejects ref deletions**
(`git push origin --delete` fails with `the remote end hung up unexpectedly`, consistently,
not a flake). There is no branch-delete tool in the GitHub MCP set either. If a branch
needs deleting, the user must do it from the GitHub UI or locally.

---

## 11. House style for this codebase

Match what is already there:

- **Comments explain *why*, not *what*.** The existing comments are dense with rationale
  — which bug a guard prevents, which design rule a structure enforces. Keep that. A
  comment restating the code is worse than none.
- **Functions are small and named for their job.** `statusOf`, `stageHasCoach`,
  `ownsProblem`, `turnsNeeded`. If you need a boolean twice, name it.
- **No new dependencies.** Vanilla JS, ES5-compatible style inside `activity.js`
  (`var`, `function`, no arrow functions or template literals — the target includes older
  iPad Safari; `sentences()` exists specifically because Safari lacked lookbehind). Test
  files are modern ESM and may use anything.
- **One thing owns each fact.** The lesson title is read off the step's own heading rather
  than stored twice. Completion lines are computed. If you find yourself writing a second
  copy of a fact, that is the bug.
- **The `.bw-*` namespace is flat and crowded.** Two class collisions have already been
  fixed this way (`.bw-example` → `.bw-starter`, `.bw-card*` → `.bw-cc*` for coaching
  cards). **Grep before you name a new class.**
- **Commit messages are long and explain the reasoning**, not just the change. Read
  `git log` for the register.
- Commits must end with the attribution lines the session's system reminder specifies.
- **Never put a model identifier** in a commit message, PR body, code comment, or anything
  else pushed to the repo.

---

## 12. First moves in a fresh session

```bash
cd <repo>
git log --oneline -8            # the last few commits explain the current direction
cat README.md                   # user-facing framing
npm test                        # ~3 min; confirms you are starting from green
npm start                       # then open http://127.0.0.1:8080 and walk it
```

Walking the app once is worth more than reading `activity.js` top to bottom. Click Start,
enter stage 1, read the lesson, press Continue, talk to the coach, take the handoff. That
path exercises most of what is described above.

To reach a later stage quickly without walking it, use the seeding pattern from
`test/helpers.mjs` (`seedThroughStage3`) or open a slice: `http://127.0.0.1:8080/role/workflow`.

### Before you push
Every push to `main` deploys to GitHub Pages. Run the full suite first. If you changed
coach behaviour or prompt generation, run the personas harness too.
