# Brainstorm an AI-Powered Workflow

A five-stage interactive activity that walks someone from a task that eats their Monday to a
master prompt they can paste into an LLM and use that afternoon. It is a standalone web app served
from the repository root, intended to be embedded in a Storyline slide from its own URL.

**Stages.** The journey map names the transferable practice; the copy inside each stage keeps this
activity's specific framing.

| Stage | The practice | In this activity |
|---|---|---|
| 1 | **Identify** — naming a problem worth solving | Name the task that keeps eating your week |
| 2 | **Map** — breaking a process into its real steps | Walk through the workflow and where each step happens |
| 3 | **Envision** — imagining the ideal version | A draft prompt, built from what you just said |
| 4 | **Refine** — sharpening vague ideas into specifics | Three short conversations with a coach |
| 5 | **Deploy** — translating thinking into action | Edit and copy the finished master prompt |

> **Status.** Originally an Articulate Rise custom block split across nine pasteable files. That
> delivery is retired. The navigation is now a journey map; the artwork and card styling on it are
> placeholder while the visual language is developed separately. The state engine underneath has
> not changed through either move.

---

## Running it

```bash
npm start     # http://127.0.0.1:8080
npm test      # six suites, 213 assertions
```

A server rather than opening `index.html` directly, because Chromium gives a `file://` page no
`localStorage` and the activity would save nothing.

| Path | What it serves |
|---|---|
| `/` | the whole activity |
| `/role/<name>` | one slice of it, for working on a stage in isolation |
| `/frames/<a,b,c>` | several slices side by side on one origin, sharing state |

### Layout

```
index.html          markup only
css/tokens.css      palette, type scale, motion  (the only place colours are defined)
css/activity.css    components
css/timeline.css    the journey map - every visual rule for it lives here
js/activity.js      the whole app: state, prompt generation, coach, DOM wiring, the map
js/vendor/gsap.min.js
test/               six Playwright suites
personas/           30 scripted run-throughs for manual testing
```

`css/tokens.css` carries the ELC564 style guide's motion conventions — `--bw-duration-micro` for
hover and press, `--bw-duration-system` for state changes, one shared easing curve so the whole
thing reads as one hand rather than several — plus a `prefers-reduced-motion` block that flattens
every CSS transition at once.

### Three views

**Landing** is what a first-time learner reads: the title, the overview, the objectives, a start
button, and the worked example folded up beneath it. **Home** is the journey map. **Stage** is the
workspace for whichever stage they entered.

Starting is one way through a GSAP transition &mdash; the landing lifts away, the map resolves in,
and the stations draw themselves along the spine. After that the landing is reachable whenever they
want it, from the back arrow at the top of home, and a return visit opens on home rather than
making them read the pitch again. That "has started" flag is its own `localStorage` key rather than
a field in the saved activity, because where someone is looking is not learner data. Starting over
clears it, so a reset really does go back to the beginning.

### The journey map

The map is home. Five stations sit on a spine, alternating above and below it; clicking an
available one enters that stage's workspace, which is the same step panel the accordion used to
expand. Finishing a stage continues straight into the next one inside the workspace &mdash; the map
is base camp, not a turnstile between every stage &mdash; and there is always a way back to it.

Nothing in the map reads or writes learner data. It renders `workflowData.progress` and calls
`openStep()`, exactly as the accordion header did, which is why gating, validation, persistence and
the coach were untouched by the change.

Three station states, one hook each: `data-state` is `locked`, `available` or `done`, and
`data-current` marks where to pick up. Completion lines are computed from structured state and
never from anything the learner typed free-hand, so a demo run full of junk still reads as a
finished journey &mdash; Map counts its steps and says *"Complete &middot; 3 steps mapped"*. A
stored `done` that no longer validates is not taken at its word.

**The art is meant to be replaced.** Five stroked marks live in one `ART` map in `js/activity.js`,
every visual rule lives in `css/timeline.css`, and the interaction layer only writes `data-state`
and `data-current` and reads nothing back. The cards can be redrawn completely without the
navigation noticing. GSAP handles entering a stage &mdash; the chosen card grows while the rest of
the journey recedes, then the workspace resolves in &mdash; using scale, position and opacity only.
`prefers-reduced-motion` skips the animation and navigates straight through.

Below 720px the spine stands up: rail on the left, stations stacked full width.

### Slices

`CONFIG.blockRole` still selects a slice of the activity, and the tests use it to drive one stage
at a time. `"all"` is the whole thing and is what ships. The rest — `"problem"`, `"coach-workflow"`,
`"coach-tools"`, `"draft"`, `"coach-handoff"`, `"coach-standards"`, `"coach-guardrails"`,
`"artifact"` — each render one piece. They exist because the activity was once nine separate
embeds; they survive because the Map and Refine stages are several conversations each, and those
conversations are defined by these roles.

---
## The two coach modes

Step 4 is the part that makes the prompt personal, and it runs one of two ways.

### Guided coach (default, no setup)

With `botEndpoint: null`, the activity runs a scripted coach built into the page. It walks the
same four questions a live model would — which step to hand over, what a good output looks like,
what stays with the learner, and what the AI must never invent — using the learner's own words,
then emits a real master prompt. It needs no network, no key, and no account, and it degrades
to nothing gracefully because there's nothing to fail.

Use it for pilots, for offline delivery, and as the fallback when a live endpoint is down.

### Live coach (bring your own endpoint)

Set one value:

```js
botEndpoint: "https://your-worker.example.com/coach",
```

**Do not put a provider API key in this file.** The page is public to every learner,
and devtools will show them anything the page holds. Stand up a small server-side proxy that
holds the key and forwards the request.

#### Request the page sends

`POST` with `Content-Type: application/json`, plus anything you add in `botHeaders`:

```json
{
  "system": "You are a workflow coach helping a working professional…",
  "context": "Here's their workflow.\n\nProblem: …\n\nCurrent workflow:\n1. …",
  "messages": [
    { "role": "user", "content": "…context + 'Start by asking me your first question.'" },
    { "role": "assistant", "content": "Which of those steps would you hand over first?" },
    { "role": "user", "content": "The drafting." }
  ]
}
```

`messages` is the full transcript in wire order, already in `user`/`assistant` form. The first
entry is a priming turn carrying the learner's workflow; it is never shown in the chat log.
`context` repeats that workflow on its own if you'd rather inject it your own way.

#### Response the page accepts

Any one of these — the adapter normalizes all of them, so most proxies work unchanged:

```json
{ "reply": "…" }
{ "message": "…" }        { "text": "…" }        { "content": "…" }
{ "content": [ { "type": "text", "text": "…" } ] }          // Anthropic shape
{ "choices": [ { "message": { "content": "…" } } ] }        // OpenAI shape
"a bare JSON string"
```

Anything else surfaces as a plain error with a **Try again** button, and the learner can still
finish — Step 5 falls back to assembling the prompt from their own answers.

#### Example proxy (Node, Anthropic SDK)

Deploys as-is to Vercel/Netlify functions or behind Express. `npm i @anthropic-ai/sdk`.

**Do not gate this on the `Origin` header.** The activity runs in a `srcdoc` iframe whose origin
serializes as `null`, so an origin allowlist can reject every real request while doing nothing to
stop a scripted one. Gate on a shared header and a rate limit instead.

```js
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();          // reads ANTHROPIC_API_KEY from the environment
const COURSE_KEY = process.env.COURSE_KEY;
const hits = new Map();                  // swap for Redis if you run more than one instance

function rateLimited(ip, perMinute = 12) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > perMinute;
}

export default async function handler(req, res) {
  // The iframe's origin is "null", so a wildcard is the only thing that works.
  // This is not the security boundary; the key check and rate limit below are.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-course-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  if (COURSE_KEY && req.headers["x-course-key"] !== COURSE_KEY) {
    return res.status(403).json({ error: "forbidden" });
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "slow down" });

  const { system, messages } = req.body ?? {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages required" });
  }

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1500,
      output_config: { effort: "low" },  // a chat turn, not a research task - keeps it snappy
      system,
      messages: messages.slice(-20).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 8000)
      }))
    });
    const reply = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "coach unavailable" });
  }
}
```

**Be honest with yourself about the shared key.** `botHeaders` lives in a file every learner can
read, so `x-course-key` raises the effort required to abuse your endpoint; it does not make it
private. What actually protects you is the rate limit above, a hard spend cap set at your provider,
and being willing to rotate the key and republish if it leaks. For a course cohort that's a
reasonable trade. For anything with real money behind it, put the endpoint behind a login your
LMS already enforces.

## Configuration

Everything tunable sits in one `CONFIG` block at the top of the `<script>`:

| Key | Default | What it controls |
|---|---|---|
| `botEndpoint` | `null` | Coach URL. `null` runs the built-in scripted coach. |
| `botHeaders` | `{}` | Extra request headers. Not for provider API keys. |
| `botTimeoutMs` | `45000` | When to give up on a coach request. |
| `storageKey` | `"brainstorm_workflow_data"` | localStorage key. Change the suffix to invalidate saved data after a breaking edit. |
| `minProblemChars` | `25` | Characters Step 1 needs before Step 2 unlocks. A floor, not a cap. |
| `minWorkflowSteps` | `2` | Filled-in cards Step 2 needs. Also the floor for the remove button. |
| `minChatTurns` | `2` | Learner replies Step 4 needs before Step 5 unlocks. |
| `blockRole` | `"all"` | Which slice to render. `"all"` is the whole activity and is what ships; see **Slices** above. |
| `syncPollMs` | `1200` | How often a slice re-checks storage for another slice's work. Unused when `blockRole` is `"all"`. |
| `followSystemDarkMode` | `false` | Off on purpose: the activity is light, and following the learner's OS dark mode drops a dark panel into a white page. |

`BOT_SYSTEM_PROMPT`, directly below `CONFIG`, is what a live coach is told to do — including the
instruction to emit its final prompt in a fenced ` ```master-prompt ` block. **Keep that
instruction if you rewrite the prompt**; it's how Step 5 finds the finished artifact.

## Answer quality

Persona testing found the activity would hand a learner who answered "just make it good" a prompt
that looked exactly as finished as one built from real answers. Three things now prevent that, and
all three work in the scripted fallback as well as behind a live endpoint:

- **One pushback per question.** A thin answer gets re-asked once, with a concrete question rather
  than "be more specific" &mdash; *"Which numbered step is it, and what do you want handed back?"*
  Never more than once, so nobody gets stuck.
- **What stays thin gets marked.** A section still vague after that is labelled
  `[NEEDS DETAIL - too vague to act on yet]` in the prompt, flagged in amber above it, and named in
  a closing instruction telling the assistant to ask about it before starting. The coach also stops
  praising answers it is about to flag.
- **Contradictions are reconciled.** A sweeping handoff ("all of it") next to a carve-out produces
  an explicit exception clause in the task section, so a model never sees two conflicting
  instructions on the highest-stakes part of the job.

The task section is also built in instruction voice: it names the workflow step the learner pointed
at, and drops sentences that only describe how much the task costs them.

Thinness is judged by length, hedging phrases, and whether anything concrete appears &mdash;
heuristics tuned against the three personas in `personas/`. They will occasionally push back on a
short but good answer, and occasionally let a fluent but empty one through. A live coach judges it
properly; the heuristics are the floor that holds when the endpoint is down.

## How the data flows

One object holds everything, saved to `localStorage` after every change (debounced 250ms, and
flushed on unload so a reload can't drop the last edit):

```js
{
  problem: "",                      // Step 1
  steps: [{ action: "", tools: "" }],  // Step 2
  toolsAll: [],                     // derived from steps, de-duplicated case-insensitively
  masterPromptV1: "",               // regenerated from problem + steps on every keystroke
  masterPromptV2: "",               // the deliverable
  v2Source: "",                     // "bot" | "template" | "user"
  botConversation: [],              // [{ role: "bot" | "user", text }]
  botAnswers: { handoff, output, keep, context, notes: [] },
  mockStage: 0,                     // scripted coach position
  progress: { current, unlocked, done: {} }
}
```

**Step 5 capture is hybrid**, by design. `parseMasterPrompt()` scans the transcript backwards for
a fenced `master-prompt` block and uses the most recent one; if the coach never produced one —
it went off-format, the endpoint was down, the learner stopped early — `generateMasterPromptV2()`
assembles a prompt from their answers with `[bracketed]` gaps where an answer is missing. Either
way the result lands in an editable textarea. Once the learner types in it, `v2Source` flips to
`"user"` and nothing overwrites their edit until they press **Rebuild from my answers**.

Editing Steps 1–2 later is fine: the draft prompt regenerates live, and a step that no longer
validates loses its checkmark until it does.

---

## Development

```bash
npm start     # the activity at http://127.0.0.1:8080
npm test      # all five suites
```

Every suite fails on any uncaught page error or unexpected console error, so a runtime exception
anywhere in the flow shows up as a test failure.

- `test/scripted-coach.test.mjs` — the offline coach end to end: validation, the card builder,
  prompt generation, the conversation, V2 capture, persistence and reset.
- `test/live-endpoint.test.mjs` — the same flow against a stub endpoint: the wire format, the three
  response shapes, timeouts, failures, retry, and the fallback when the coach never answers.
- `test/capture-chat.test.mjs` — the Map stage's two conversations: that a run-on sentence, a typed
  numbered list and a one-per-line list all land in the same steps array, that a correction by
  number rewrites only that step, that "yes that looks right" is agreement while "yes, but step 2 is
  wrong" is an edit, that a step remembered late lands where the learner said it goes, and that a
  tool count that doesn't match the step count is asked about before it is guessed at.
- `test/answer-quality.test.mjs` — that a vague answer is pushed on once and then accepted, that
  thin sections are marked and warned about, that good answers produce neither, that a sweeping
  handoff plus a carve-out is reconciled explicitly, and that the task section names the step in
  instruction voice with the complaint dropped.
- `test/timeline.test.mjs` — the landing and the journey map: that the activity opens on the
  landing with the objectives and a start button above the worked example, that starting reaches
  home, that the back arrow returns to the landing without losing progress, that a return visit
  opens on home, that stations that stations
  alternate and carry the three states, that a locked one says which stage opens it and cannot be
  clicked, that entering shows exactly one stage and does not repeat the timeline inside it, that
  finishing a stage continues into the next without returning home, that completion lines count
  real data, that a stale stored `done` is corrected, and that navigation still works with motion
  turned off and at 360px. It asserts on no colour, size or illustration.
- `test/hardening.test.mjs` — the failure modes that survived the move off Rise: that the page
  declares its own encoding, that dark mode stays off by default and still works when opted in,
  that copying survives a missing clipboard API and leaves the text selected when it can't copy at
  all, and that one press of Start over never erases anything.

### Test personas

`personas/library.mjs` holds 30 complete run-throughs &mdash; a problem statement, a workflow, and
the four chat answers &mdash; spread across different jobs and deliberately varied in answer quality:
some specific, some vague, some self-contradicting, some edge cases for the interface (a seven-step
workflow, a two-step one, an all-paper workflow, a learner who answers questions with questions).
Six carry `retry` answers for when the coach pushes back.

`node personas/library-page.mjs` builds two offline copies: `personas/library.html`, a self-contained
page with a copy button on every field, which works opened straight from disk; and
`personas/library.csv` for anyone who would rather work in a spreadsheet. Both are generated, so edit
`library.mjs` and re-run rather than editing them. Three of the 30 are also the regression set in `personas.mjs`, replayed
headlessly by `node personas/run.mjs` and written up by `node personas/report.mjs`.

Tests need Playwright (`npm i -D playwright`, or a global install — the helper finds either).

