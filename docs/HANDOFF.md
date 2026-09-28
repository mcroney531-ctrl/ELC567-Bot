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
npm test      # ten Playwright suites, 521 assertions, ~3 min
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
  admin.css             the ?admin=1 review bar — never loaded into the learner's flow
img/
  explainer/            ten explainer cards (268x543 PNG) from the user's artwork package
js/
  activity.js           the entire application, one IIFE
  vendor/gsap.min.js    vendored from the user's ELC564-StyleGuide repo
test/
  helpers.mjs           serveSite, withConfig, makeReporter, waitBots, seedThroughStage3
  coach-stub.mjs        fake LLM endpoint for the live-adapter suite
  serve.mjs             the dev server behind `npm start`
  *.test.mjs            nine suites (see §7)
admin/index.html        a redirect to /?admin=1 (see §6.5)
personas/               offline persona-run harness (see §9)
docs/design/            three design packs the user supplied, committed verbatim
docs/HANDOFF.md         this file
README.md               user-facing overview
```

**Stylesheet order matters** and is fixed in `index.html`:
`tokens → activity → timeline → home → stage → chat → admin`. Later files assume the
earlier ones. `gsap.min.js` loads before `activity.js`.

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
| 3 | Envision | `envision` | above | `Complete · Future state defined` |
| 4 | Refine | `refine` | below | `Complete · Coach review finished` |
| 5 | Deploy | `deploy` | above | `Complete · Master prompt ready` |

Map is one stage that reads twice and then asks for the steps — the reading and the form
share a number rather than sitting either side of one. Envision is the only stage that
captures the learner's own words without a coach.

**What "mapped" means is one rule, and the copy on screen is it.** `stepValid(2)` wants at
least `minWorkflowSteps` rows carrying *both* the action and the tool it happens in, and no
row left half-written (`completeSteps()` / `startedSteps()`). It used to accept enough
actions plus one tool anywhere, which contradicted the warning the learner is shown and
disagreed with what `migrateV2()` counts as mapped. The one exception is the
`coach-workflow` slice, which takes down actions alone because its sibling slice is what
asks where each one happens.

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
- `setView()` puts the current view on `<html>` as `data-bw-view`. `timeline.css` uses
  it to remove the browser page's margin and colour the page to match each view:
  lavender for the landing, the stage shell's navy, and the home letterbox. No white
  page shows in any view. A `/role/` slice never calls `setView()`, so an embedded
  slice keeps its host's page. On home, the map fills the window, the frame is centred
  in it both ways, and the footer sits at the bottom, so nothing scrolls.
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
  version: 4,
  problem: "",                       // stage 1's output
  steps: [{ action, tools }, ...],   // stage 2's output, min 2 complete rows
  toolsAll: [],                      // deduped across steps
  idealOutcome: "", aiRole: "",      // stage 3's output - the learner's own words
  masterPromptV1: "", masterPromptV2: "", v2Source: "",  // "bot" | "template" | "user"
  conversations: { all: [], identify: [], map: [], envision: [], workflow: [], tools: [],
                   deploy: [], handoff: [], standards: [], guardrails: [] },
  mockProgress:  { ...same keys, all 0 },   // scripted-coach turn cursor
  botAnswers: { handoff, output, keep, context, notes: [] },
  pushedBack: {},                    // one push-back per question, so nobody loops
  decided: {},                       // which of Refine's four decisions are settled
  progress: { current: 1, unlocked: 1, done: {}, entered: {} }
}
```

Persisted to `localStorage` under `CONFIG.storageKey` = `"brainstorm_workflow_data"`.
Writes are debounced 250 ms (`save()` → `writeNow()`).

**Why Envision's answers are top-level and not in `botAnswers`.** `botAnswers` is what a
coach got out of a learner. `idealOutcome` and `aiRole` are what the learner wrote,
unmediated — so they sit beside `problem` and `steps`, which are the same kind of fact.
A coach reads them; nothing writes them but the form.

### Refine's four decisions
`REFINE_DECISIONS` is the single source of truth for what stage 4 has to settle and in
what order:

| # | key | rail label |
|---|---|---|
| 1 | `handoff` | What AI handles |
| 2 | `keep` | What stays yours |
| 3 | `output` | What good looks like |
| 4 | `context` | What AI needs to know |

`refineRecap()` names them with these same labels, lowercased, so the close lands on the four
things the learner watched tick off rather than four new words for them.

`notes[]` stays optional. The rail items, the scripted questions, the live coach's
instruction and `stepValid(4)` are all built from this list, so the order cannot drift
between them. Change the list and all four follow.

**The coach's voice, and where it lives.** Observant, concise, specific, nonjudgmental. It
records what the learner decided and reflects it back accurately; it does not praise an answer
it is in no position to evaluate. "That's the right instinct" fires identically whether someone
hands over the right step or the one they should have kept, so it is gone, along with "that's a
vibe" and "what would keep you up at night" — a push-back should teach the idea it is asking
for, not perform. The strings are `DECISION_ACK` (one per decision), `PUSHBACKS`, `THIN_ACCEPT`
and `refineRecap()`, and the same rule is written into `BOT_SYSTEM_PROMPT` so a live coach
sounds like the same coach.

**The opening picks up from the learner's work rather than reciting it.** The problem and the
mapped steps are pinned in the coaching cards directly above the transcript, so an opening that
read them back was the coach reciting a worksheet. It carries excerpts of the vision — which
nothing else on the screen shows — and then asks the first question. A `/role/` slice never
reaches the chat phase and so has no cards, which is the one case where the steps are still
read back.

**`decided` is not the same as "there is an answer".** The first thin answer is written to
`botAnswers` — in case the learner stops there — while the coach is still challenging it.
Only the second answer settles the decision, and it is accepted whatever it says, earning
`[NEEDS DETAIL]` rather than a third question. That is the whole rule: **complete coverage,
imperfect answers allowed.** `captureDecision()` is where it lives, and it runs on the
learner's message before any coach replies — which is what makes it true of a live coach as
well as the scripted one.

### Version 4, and opening older saves
`readStored()` gates on the version and upgrades in a chain: v2 → `migrateV2()` → v3 →
`migrateV3()` → v4. Nothing is discarded, and `load()` writes the upgrade straight back — otherwise a learner who opens
the page and leaves still has a v2 payload, and a sibling `/role/` block reading storage
would see the old shape and the old stage meanings.

What the upgrade does:
- **Carries authored work across unchanged**: `problem`, `steps`, `toolsAll`, both prompts,
  `v2Source`, `botAnswers`, `pushedBack`, and every transcript whose key still means the
  same conversation. `describe` is gone and its stage never had a coach, so there is
  nothing to bring across from it.
- **Starts the vision empty**, because it was never asked for.
- **Re-derives progression from the work itself** rather than copying it: `done[1]` if the
  problem validates, `done[2]` if the steps do, and the learner resumes at the first stage
  that is not done. Envision cannot be complete in a save that predates it, so a v2 learner
  who had finished the old journey lands on stage 3 as *available* — not *current*, because
  the upgrade does not pretend they have been into a stage that did not exist.

`test/envision-stage.test.mjs` holds this with a v2 fixture.

`migrateV3()` adds `decided`, and the evidence it reads is **the old scripted cursor, not the
answer text**. In v3 a first thin answer wrote `botAnswers`, set `pushedBack` and then stopped
— the coach was still challenging it — and only an accepted answer advanced `mockProgress`. So
`mockProgress` counts the decisions that were really settled, while text-plus-`pushedBack` is
exactly the state of someone who closed the browser mid-challenge. Reading that as settled
handed them an unlocked Deploy for a question they never finished.

`V3_ACCEPTED_ORDER` holds the orders those cursors were written against — `all` ran handoff,
output, keep, context, and each slice ran its own part. **They are not the order Refine asks in
now**, which is why they are written down rather than derived from `REFINE_DECISIONS`: they
describe a shape of save that no longer exists and must not follow the live list when it
changes. Anything with no cursor evidence stays undecided and is asked again — one answer's
cost, against a section of prompt the other way.

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
`render()` un-ticks stages 1 to 3 if their stored `done` no longer validates:
```js
[1, 2, 3].forEach(function (n) {
  if (workflowData.progress.done[n] && !stepValid(n)) workflowData.progress.done[n] = false;
});
```
A stored tick is never taken at its word.

Restarting Refine is the one place a completed stage is actively revoked. Clearing `decided`
alone was not enough: `render()` re-validates stages 1 to 3, so a stage 4 that had already been
ticked kept its tick and Deploy stayed unlocked — a way back into a finished prompt with none
of the work behind it standing. `restartConversation()` now takes the tick and Deploy's unlock
with it, scoped to that deliberate act; editing an earlier stage's work behaves as it did.

Stage 4 is the same idea by a different route: `stepValid(4)` is `refineComplete()` — all four
decisions accepted — not a turn count. A learner can talk for ten turns and still be held, and
`warningFor(4)` names which decisions are outstanding rather than asking for more messages. A
`/role/` slice runs one of the older split scripts and owns only part of the set, so it keeps
the turn-count rule.

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
var STAGE_CONVO = { 1: "identify", 2: "map", 3: "envision", 4: "all", 5: "deploy" };
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

### Refine's progression is the application's, not the model's
`captureDecision(text)` runs in `sendChat()` — before any reply exists — so the scripted
coach and a live one write the same state through the same push-once rule. The coach then
*reads* it: `refineReply()` builds the scripted reply from what the capture just did, and a
live model is told about it through `coachingState()`, which is appended to
`contextInjection()`.

**This was a real hole, not a precaution.** Before it, `mockCoachReply()` captured the four
answers and the live path captured nothing at all — `askBot()` only appended the transcript.
A coverage gate over those four keys would have let a scripted learner through and trapped a
live one in Refine forever.

**No wire-contract change was needed.** The decision state rides inside the `context` string
the endpoint already receives; `{system, context, messages}` is unchanged.

### No prompt before Deploy is enforced, not requested
Three layers, because a system prompt is a request:
1. The scripted coach closes Refine on a recap (`refineRecap()`), never a prompt.
2. `BOT_SYSTEM_PROMPT` tells a live model not to show one.
3. `stripPromptBlock()` removes **prompt** blocks from a Refine reply before it is appended,
   so a model that ignores the instruction costs the learner nothing. It also catches the
   scripted coach, which is why a regression there shows up as a missing recap rather than a
   leaked prompt.

The rule is *no master prompt before Deploy*, not *no fenced content in Refine*, and the filter
is written to that: `isPromptBlock()` is the one definition of "this block is a prompt" — a
`master-prompt` or `prompt` tag, or an untagged block that looks like the artifact —
and both `stripPromptBlock()` and `parseMasterPrompt()` call it, so the filter and the parser
cannot come to disagree about what they are looking at. A fenced JSON sample, a snippet of
code, or a format example a coach writes while discussing standards survives untouched.

**The copy is guarded too, not just the behaviour.** The same contradiction was written twice
after the rule was locked — a guardrails intro promising the coach "hands back the finished
prompt at the end", and before it a scripted turn that actually did — and both were caught by
reading rather than by a test. `refine-stage` now checks the rendered coach-facing copy, in the
journey and in the three split-coach preview routes, against a set of *promise* patterns. The
invariant is narrow on purpose: not "coach copy never says prompt", which would outlaw
legitimate lines like "this is where a generic prompt becomes yours" and send people round the
guard, but "no coach-facing copy before Deploy may promise the learner will be shown the
finished prompt". The matcher is checked both ways in the same test — it must catch the
wording that slipped through, and must leave the legitimate lines alone — because a guard that
has quietly stopped matching anything passes every run and protects nothing.

A consequence worth knowing: nothing in the journey emits a `master-prompt` block any more,
so `latestBotPrompt()` never fires and `v2Source` is always `"template"` — assembly from the
four decisions is the normal path now, and the note under the prompt says so rather than
apologising for the coach. `parseMasterPrompt()` and the `"bot"` branch are left in place but
are unreachable in the full activity; deleting them is a separate decision.

### Which stages have a coach
```js
var STAGE_COACH = { 1: true, 4: true };
```
Stages absent from this map run lesson-only and Continue goes straight onward — to the next
page, to the stage's own panel, or out of the stage, in that order (`advanceLesson`).
Stages 2 and 3 are reading-then-form for exactly this reason: they capture without a
conversation.

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
The capture chats (`/role/coach-workflow`, `/role/coach-tools` — Map's slice roles, not
reachable in the full activity) turn prose into a numbered list. Key functions:
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
  `toolsAll`. **No screen in the journey shows it.** It is still generated, because
  `/role/draft` previews the retired screen it used to live on.
- **V2** (`generateMasterPromptV2`) — the finished prompt, and the only one a learner sees.
  Preferred source is the coach's own fenced block, lifted by `parseMasterPrompt()`; falls
  back to a template build.

Section headings, fixed — six of them, and **Envision did not add a seventh**:
`## CONTEXT`, `## WHAT I NEED YOU TO DO`, `## WHAT STAYS WITH ME`, `## OUTPUT I EXPECT`,
`## THINGS YOU NEED TO KNOW`, `## HOW TO WORK WITH ME`.

**How Envision reaches the artifact: transformed, not copied.** The outcome goes into
`## CONTEXT` as `What I am trying to get to:` — it is what the work is *for*. The role goes
under `## WHAT I NEED YOU TO DO` as `In broad terms:`, framing the task line rather than
replacing it. Both lines are conditional, which is why the template is built as a list with
`out.push()` rather than one concatenation. A learner should recognise their own thinking
here without finding a worksheet field pasted into a prompt — no field label from the form
appears in the output, and that is asserted.

Refine's coach gets the same two answers through `contextInjection()`, along with an
instruction not to propose a vision of its own: its job is to make the learner's one
executable. The scripted coach's opening reads the vision back deterministically.

`v2Source` tracks provenance (`"bot" | "template" | "user"`). A **manual edit wins** and
survives reload; regenerating requires an explicit two-press confirm on `#bw-regen-v2`.

`answerQuality()` marks thin answers so the artifact is honest about what it is missing
rather than looking equally finished either way. Deploy can still say a section is weak; what
it can no longer do is open with a section nobody was ever asked about.

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

> `/role/` and `/frames/` are **test-harness routes only** — they are implemented in
> `serveSite()`, not on GitHub Pages. They work under `npm start` and in tests, and 404
> on the deployed site. Admin mode (below) is different: it is a query flag, so it works
> everywhere.

---

## 6.5. Admin mode

A review harness for walking the activity end to end without answering it. Section 11 of
`activity.js`.

**Turned on by `?admin=1`.** `/admin/` is a real directory (`admin/index.html`) whose only
job is to `location.replace("../?admin=1")` — GitHub Pages has no router, so a query flag
is the only thing that works on Pages, Netlify, `npm start` and inside a Storyline iframe
alike. The flag is what the app reads; the directory is a convenience door.

The bar offers: **Skip →** (fill the open stage, then advance), **Fill all**, stage jump
buttons **1–5**, a **lesson ⇄ chat** toggle, **Map**, and **Clear**.

Two rules it must keep, because they are why it is trustworthy:

1. **It writes only through the functions a learner's clicks reach** — `setActions`,
   `recomputeTools`, `openStep`, `goNext`, `setPhase`, `refreshV2`. It never sets
   `progress.done` directly and never invents a state the real flow could not produce. A
   bug visible only in admin mode is a bug *in* admin mode, which is worthless. The suite
   asserts this by comparing what admin mode leaves behind against what the real flow
   leaves behind — same map states, same computed completion lines, same `v2Source: "bot"`.
2. **It is additive.** Every element is created at wire time; nothing in the learner's
   markup or CSS knows it exists. The bar is a sibling of `.bw`, not a child — asserted.

`ADMIN_SAMPLE` holds deliberately recognisable answers (eleven client status updates,
Asana/Harvest/Gmail). If one turns up in a screenshot of "learner work", the screenshot
came from admin mode.

**It is not a security boundary.** Anyone can type `?admin=1`. There is nothing behind it
to protect — it fills in sample answers a learner could type themselves. Do not put
anything there that is not safe to be public.

---

## 7. Tests

Twelve Playwright suites, all passing. Run `npm test` for the current totals; the counts
below are each suite's own report at the time of writing.
(The counts below are what each suite reports when it runs, which is authoritative —
grepping for `check(` undercounts, because some assertions span lines.)

| Suite | Asserts | Covers |
|---|---|---|
| `scripted-coach.test.mjs` | 90 | Full walkthrough on the scripted coach: gating, the builder, V1, the conversation, V2 capture, persistence, copy, reset, mobile |
| `timeline.test.mjs` | 94 | Journey map: five stations, four states, navigation rules, the connector, responsive |
| `station-count.test.mjs` | 25 | That the journey's length is data: five as shipped, and the same machinery served one station shorter |
| `learning-stage.test.mjs` | 105 | Dark shell / light workspace, mini-node strip, the constant-shell rule, multi-page reading, lesson vs panel stages |
| `chat-stage.test.mjs` | 69 | Coach phase as a mode not a second app; stage 1 lesson→coach; per-stage transcripts |
| `envision-stage.test.mjs` | 53 | Stage 3 end to end: reading→form, what counts as an answer, where it is stored, the carry into Refine's coach and Deploy's prompt, and the v2→v3 upgrade |
| `refine-stage.test.mjs` | 82 | Stage 4's four decisions: the rail, coverage as the gate, push-once acceptance, the same progression under a live coach, and that no prompt reaches the learner before Deploy |
| `capture-chat.test.mjs` | 35 | Prose→structured parsing for workflow and tools |
| `live-endpoint.test.mjs` | 30 | The live adapter: request shape, history format, headers, errors, retry, timeout |
| `admin.test.mjs` | 47 | Admin mode: off by default, jumping, skipping, fill-all, and that every state it produces matches what the real flow produces |
| `answer-quality.test.mjs` | 21 | Thin-answer heuristics and push-backs |
| `journey-contract.test.mjs` | 42 | The journey the learner is told about, the five places that must agree about what each step number means, and that no prompt reaches a learner before Deploy |
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

`seedState(overrides)` builds a v3 save; `seedThroughStage3(page)` seeds it via
`addInitScript` so a suite can open at stage 4 without walking the whole activity. Used by
`live-endpoint`, because stage 1 now has its own live coach whose calls would otherwise land
in the request log those assertions read. `SEED_VISION` holds the Envision answers the seed
carries, so a suite that needs stage 3 to validate does not have to invent prose that passes
the thin-answer heuristic.

`withoutStation(name)` rewrites the served source to drop one entry from `STATIONS`, which
is how `station-count` proves the count is derived. The four-stage journey it produces is a
structural fixture, never a product.

**`addInitScript` runs on every navigation, including `page.reload()`.** A suite that seeds
unconditionally and then reloads is testing the fixture, not persistence — `envision-stage`
seeds only when storage is empty for exactly this reason.

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
- Stage 1: lesson screen (real copy, supplied by the user) → coach → handoff.
- Stage 2: two lesson pages → the workflow builder. Stage 3: lesson → the two-field vision.
- Stage 4: four required decisions, settled through the coach and owned by the app, with
  the same progression whether the coach is scripted or live. Stage 5's artifact.
  V1 still generated, shown nowhere.
- Version 3 saves, with a v2 upgrade that keeps the work and re-earns the ticks.

### The journey, as built

```
01 Identify   define the problem worth solving              lesson -> coach
02 Map        understand reality at tiny step + tool level   lesson x2 -> form
03 Envision   define the ideal outcome, then AI's part in it lesson -> form
04 Refine     turn that vision into responsibilities,        lesson -> coach
              standards, context and guardrails
05 Deploy     review, edit and use the finished prompt       artifact
```

This is the settled journey and it is implemented. Two things about it are worth knowing
before changing anything:

- **Map is one stage, not two.** An earlier structure had a standalone Describe reading at
  stage 2 and the mapping form at stage 3. They are now the same stage: two lesson pages
  and then the form. The reading and the work it asks for share a number, which is what
  removed the step-number/stage-name mismatch that used to be the top hazard in this file.
- **Envision is a reading and a form, not a conversation.** Its output is the learner's own
  words, so it is stored as top-level learner data (§3) and reaches the artifact
  transformed (§5). The learner still sees no prompt before Deploy.

The station count is derived from `STATIONS`, so adding or removing a station no longer
touches progress arithmetic, rail geometry or the map grid. `test/station-count.test.mjs`
holds that line, and `test/journey-contract.test.mjs` holds the copy and the number
coupling.

### Open work, roughly in priority order

1. **Lessons for stages 4 and 5.** `STAGE_LESSON` covers stages 1, 2 and 3. Stages 4 and 5
   still open on their original panels. Adding one is an entry plus prose:
   ```js
   var STAGE_LESSON = { 1: { blocks: STAGE_1_LESSON, card: "plan" } };
   ```
   `card` is optional and names an entry in `EXPLAINER_CARDS` (path + alt text). Ask the
   user which card goes with which lesson rather than guessing. All the machinery
   (`renderLesson`, `placeWorkspaceExtras`, the Continue wiring) is already general.

2. **Real lesson copy.** Stages 1, 2 and 3 are written — stage 1 and Map's two pages
   verbatim as the user supplied them, Envision's short reading written to the user's brief
   (outcome first, technology second). Stages 4 and 5 have none. **Do not write
   instructional copy for them without asking** — the user writes it and hands it over.

   Copy is a list of typed blocks, rendered one node per type by
   `buildLessonBlock()`: `h` (the question a section answers), `p`, `list`
   (with an optional `lead`), `defs` (term/definition pairs with an optional
   `note`), and `turn` (the handoff, which poses the question the stage's work
   is about to ask and sits directly above Continue). A lesson may give `paras`
   instead, which is shorthand for all-paragraphs. Nothing goes through
   `innerHTML`.

   **A lesson can be several pages.** `STAGE_LESSON[n].pages` is a list; a
   single-page lesson may be written as the page itself, which is what stages 1 and 3 do.
   Map uses two pages, so the counter and the Back button are live content, not
   theory. The page index `lessonPage` is module state, like `view` and `phase` — where
   someone is looking is not part of their work, so entering a stage always starts its
   reading at page one. **Past the last page is how a stage reaches its own panel**, so
   `onLessonPage(n)` ("is reading") is a different question from `stageLesson(n)` ("has a
   lesson"); `placeWorkspaceExtras` and `renderLesson` both need the first one. A page may
   carry its own `title`/`sub` to retitle the workspace — Map's first page does, and its
   second falls back to the stage's own heading.

   `work: false` on a lesson says Continue leaves the stage instead of uncovering a panel.
   Nothing uses it today; every stage with a lesson has work behind it.

   **The retired draft-prompt screen.** It is no longer part of the journey and no longer
   sits in the step list: it lives in `<div class="bw-retired" id="bw-draft-wrap" hidden>`,
   outside `.bw-steps`, revealed only by `/role/draft`. V1 is still generated into it, which
   keeps that preview honest; the coach never needed the V1 text, because
   `contextInjection()` hands it the problem, the steps, the tools and the vision directly.
   **The learner sees no prompt until Deploy**, and a walk of all five stages asserts it.

   **Stage numbers are still coupled across five definitions**: `stepValid`, `warningFor`,
   `GATES`, `ROLES`, and the re-validation list at the top of `render()`. The merge removed
   the mismatch, not the coupling — step 2 means Map's form and step 3 means Envision's two
   fields in all five. Check them together if the order changes again;
   `test/journey-contract.test.mjs` exercises all five through the UI and names which one
   drifted, so you will hear about it rather than finding out from a stuck learner.

   Tests that need a stage's workspace call `readLesson(page)` from
   `test/helpers.mjs`, which clicks through to the end of the reading rather than
   counting Continues — so adding a page to a lesson does not break them.

3. **Refine's copy is Claude-drafted, not authored.** The four questions come from the
   user's own brief and should not be reworded without asking, but the acknowledgements
   between them (`DECISION_ACK`), the recap and the push-back lines were written in the
   build session. They are the next thing to hand over to the user.

4. **Map's coach.** The `workflow` and `tools` capture scripts exist and `STAGES` has
   entries for them, but Map is **not** in `STAGE_COACH` and there is no combined
   workflow-then-tools script for a single conversation. Map captures through its form
   today. This is the main unfinished piece of the coach story, and it is now a question of
   whether it is wanted rather than a gap: the form works.

5. **Deploy has no coach and probably needs none.** `STAGE_CONVO` maps it to `deploy` and
   `STAGES` has an entry, but stage 5 is an artifact to read, edit and copy. Ask before
   adding a conversation to it. Envision deliberately has none — that was a product
   decision, not an omission.

6. **Three unused coaching-card types** (`example`, `refinement`, and the specificity
   checklist) render correctly from the typed shape, but nothing emits them.

7. **Chat scroll behaviour.** The chat-interface pack asks for "don't fight a learner who
   has scrolled up." Not implemented — `scrollChat()` always scrolls to the bottom.

8. **`STAGE_EXAMPLES[1]` has no screen to render on.** Those three starter examples were
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
- **Theme:** the landing is the last screen still on the light lavender theme; home and
  the stage are the dark shell family. Open question, not a bug.

The Course Overview's old "three phases" line is gone — it now walks the same five stages
the map shows, in the same order, and `journey-contract` asserts both the count and the
order so the landing cannot drift behind the journey again.

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
- **The `.bw-*` namespace is flat and crowded.** Three class collisions have already bitten
  (`.bw-example` → `.bw-starter`, `.bw-card*` → `.bw-cc*` for coaching cards, and an
  unscoped `.bw-card-num` in `home.css` reaching into the workflow step cards in
  `activity.css` and tearing their number out of the grid). **Grep before you name a new
  class**, and scope a component's rules to something that component owns — `home.css`
  now qualifies every `.bw-card-*` rule with `.bw-station-card` for this reason.
  `.bw-card-*` is still shared between the journey-map stations and the step cards;
  renaming the station's set to `.bw-station-*` is the real fix and has not been done.
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

To reach a later stage quickly without walking it, open **`http://127.0.0.1:8080/admin/`**
and use the review bar (§6.5) — that is what it is for. The seeding pattern in
`test/helpers.mjs` (`seedThroughStage3`) and the slices (`/role/workflow`) are the other
two ways in.

### Before you push
Every push to `main` deploys to GitHub Pages. Run the full suite first. If you changed
coach behaviour or prompt generation, run the personas harness too.
