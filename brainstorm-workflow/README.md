# Workflow Brainstorm — Rise Custom Block

A five-step guided activity that walks a working professional from "this task eats two hours
every week" to a **master prompt** they can paste into Claude or ChatGPT and use that day.

Everything ships as one self-contained file: `index.html`. No build step, no dependencies,
no external requests unless you connect a coach endpoint.

| Step | What the learner does | What the code does |
|---|---|---|
| 1 | Describes the repetitive task | Captures `problem`, gates on ~40 characters |
| 2 | Breaks it into steps + tools | Card builder; derives a de-duplicated tool list |
| 3 | Reads the auto-generated draft prompt | `generateMasterPromptV1()` regenerates on every keystroke |
| 4 | Talks to a coach that pushes on the vague parts | Pluggable bot adapter; transcript kept in state |
| 5 | Edits and copies the finished prompt | Lifts the coach's `master-prompt` block, or assembles one |

---

## Putting it in Rise

Run `npm run build` and paste the files from `dist/` — one per block, no editing inside Rise:

| Paste this file | Into the block that should be |
|---|---|
| `dist/1-intro.html` | The hook, the outcome, and the worked example |
| `dist/2-problem.html` | Name the repetitive task |
| `dist/3-coach-workflow.html` | Chat: describe the workflow, the coach numbers it |
| `dist/4-coach-tools.html` | Chat: where each of those steps happens |
| `dist/5-draft.html` | The draft prompt, built from blocks 2 to 4 |
| `dist/6-coach-handoff.html` | Chat: which step should the AI take over |
| `dist/7-coach-standards.html` | Chat: what good looks like, what stays yours |
| `dist/8-coach-guardrails.html` | Chat: house rules, then hands back the prompt |
| `dist/9-artifact.html` | The finished master prompt |

Three alternatives if nine blocks is more than you want: `dist/alt-workflow-form.html` replaces
blocks 3 and 4 with the original fill-in-the-cards form in a single block,
`dist/alt-capture-combined.html` puts the intro and blocks 2-5 together, and
`dist/alt-single-block.html` is the whole activity in one.

Each file is the whole activity with its `blockRole` already set, so you never hunt for a config
line in Rise's code editor. Put your own Rise text blocks between them. Edit `index.html` and re-run
the build to regenerate them all; `npm test` runs the built files through the full lesson so a broken
build can't ship quietly.

### The manual route

1. Add a **Multimedia → Embed** block (or any custom-code block your Rise plan exposes).
2. Paste the entire contents of `index.html`.
3. Save and preview.

Notes that matter in Rise specifically:

- **Styles are namespaced.** Every rule is scoped under `.bw`, so the activity can't restyle the
  lesson around it and Rise's own CSS can't bleed in.
- **No fixed widths.** The layout is flex/grid throughout and reflows from 360px up.
- **Height.** Rise sizes the block from its content. If your host needs telling, the page posts
  `{ type: "bw:height", height }` to its parent on every resize — wire that up on the host side
  if you need it, ignore it otherwise.
- **Progress is per-browser.** State lives in `localStorage`, not in Rise, so it does not travel
  to an LMS gradebook and does not follow a learner to another device. If you need completion
  tracking, gate the Rise lesson on something else.

---

## Splitting it across several Rise blocks

The activity is built to be pasted into several Rise custom blocks in one lesson, with your own
teaching content between them. Each paste is the same file with one line changed:

| Block | `blockRole` | What it is |
|---|---|---|
| 1 | `"intro"` | The hook, the outcome and the worked example. No steps, no progress rail, no state |
| 2 | `"problem"` | Name the repetitive task |
| 3 | `"coach-workflow"` | Chat: walk me through the workflow — the coach numbers it |
| 4 | `"coach-tools"` | Chat: where does each of those steps happen? |
| 5 | `"draft"` | The auto-built draft prompt |
| 6 | `"coach-handoff"` | Chat: which step should the AI take over? |
| 7 | `"coach-standards"` | Chat: what does a good result look like, and what stays yours? |
| 8 | `"coach-guardrails"` | Chat: context and house rules — closes by handing back the prompt |
| 9 | `"artifact"` | The finished master prompt, editable and copyable |

Every block waits on what it actually needs and opens itself when that arrives: block 3 on the task
being named, block 4 on the steps being mapped, block 5, the later chats and the artifact on both.
Use any of the last three chats, in that order — you don't need all three. `"workflow"` replaces
blocks 3 and 4 with the original card form, `"capture"` bundles blocks 1-5 into one, and the default
`"all"` keeps the whole activity in a single block.

**Five chats, one shared master prompt.** Each has its own transcript, its own heading, and its own
one or two questions; each writes its own slice of the data. Blocks 3 and 4 take the workflow down
(see below); blocks 6-8 sharpen it. Chat 7 opens by quoting what chat 6 captured, chat 8 by quoting
chat 7, so it reads as one coach picking up a new thread rather than strangers asking overlapping
questions. All of them stay live and editable — a learner can scroll back and revise, and the change
flows forward.

### Blocks 3 and 4: the workflow is captured by conversation

There is no form to fill in. The learner describes their process the way they'd say it out loud
(*"I pull the numbers, then draft each account update, then reformat the deck"*) and the coach turns
it into a numbered list and reads it back. Typed numbered lists, one-per-line lists and run-on
sentences all land in the same `steps` array, because that array is what the master prompt is built
from and nothing else.

- **Corrections are by number.** *"Step 2 should be draft from the CRM notes"* rewrites that step
  and leaves the rest alone. *"Yes, but step 2 is wrong"* is read as an edit, not as agreement.
- **A step remembered late lands where they said it goes.** *"Oh and then I email it"* appends;
  *"before that I export the numbers"* goes to the top.
- **One step is not a workflow.** A single-step answer gets asked what comes before and after.
- **Block 4 pairs tools to numbers.** *"1 Tableau, 2 Word, 3 PowerPoint"* pairs exactly; a bare list
  that matches the step count zips in order; one tool named alone goes on every step. When the
  counts don't line up it asks once rather than guessing, and only after that does it match in
  order — flagging that it guessed, so the learner can fix it by number.
- **The two blocks co-own the `steps` array.** Block 3 writes what each step *is*, block 4 writes
  where it *happens*. Each writes only its own half, so re-describing the workflow can't wipe the
  tools and vice versa.

Parsing runs on the learner's message in both scripted and live mode: a live coach writes better
replies than the script does, but it can't write into the steps array.

Because every chat unlocks at once, a later one can write its opening before the learner has
answered the earlier one. While a chat is still untouched its greeting stays current: the moment the
upstream answer lands, it rewrites to reference it. Once the learner has replied, the transcript is
history and stays put.

Ownership is per answer key, not per field, which is what stops the blocks trampling each other.
Editing the problem statement in block 1 can't wipe the conversation in block 3, and restarting one
chat clears only its own answers.

### Keeping the blocks in step

State lives in `localStorage`, and three mechanisms keep it current — **the `storage` event is the
least of them.** Two separate runs on a published Review 360 lesson showed the same asymmetry: the
upper block recorded events (3, then 2) while the lower block recorded zero both times. Upward
propagation works; downward is in doubt, and downward is how this activity's data flows. So:

- **A poll every `syncPollMs`** (1.2s), which is what makes the split correct rather than lucky.
- **A sync the moment a block scrolls into view.** Below the fold is where browsers throttle timers
  and where the learner is heading next. `IntersectionObserver` with an implicit root is clipped by
  the parent frame — verified, not assumed.
- **The `storage` event**, when it happens to arrive.

The suite proves each of these carries the flow on its own, and a negative control with all three
disabled confirms the sync genuinely breaks — so none of those tests can be passing for an
unrelated reason.

**Check the split works in your account before building on it.** A Rise lesson is one scrolling page
and its embed blocks are iframes; whether they share a storage origin is version- and
plan-dependent. `tools/rise-storage-probe.html` answers it in about a minute. Read the *marks*, not
the event counter. If it reports BLOCKED or each block only ever sees its own mark, stay on the
single-block `"all"` setup.

One consequence: state is keyed to the domain the lesson is served from, so preview, a review link,
and the published or SCORM copy each keep their own. Progress does not follow a learner between them.

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

**Do not put a provider API key in this file.** A Rise custom block is public to every learner,
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

---

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
| `blockRole` | `"all"` | Which slice this block renders: `"all"`, `"intro"`, `"problem"`, `"coach-workflow"`, `"coach-tools"`, `"workflow"`, `"draft"`, `"capture"`, `"coach-handoff"`, `"coach-standards"`, `"coach-guardrails"`, `"artifact"`. See above. |
| `syncPollMs` | `1200` | How often a split block re-checks storage for a sibling's work. Only used when `blockRole` isn't `"all"`. |
| `followSystemDarkMode` | `false` | Off on purpose: a Rise lesson is light, and following the learner's OS dark mode drops a dark panel into a white page. Turn on only if your host is dark. |

`BOT_SYSTEM_PROMPT`, directly below `CONFIG`, is what a live coach is told to do — including the
instruction to emit its final prompt in a fenced ` ```master-prompt ` block. **Keep that
instruction if you rewrite the prompt**; it's how Step 5 finds the finished artifact.

---

## Deploying to Review 360

The activity is built to survive a Rise iframe it does not control, which is what a published
Review 360 link gives you:

- **It stays light.** OS dark mode is ignored unless `followSystemDarkMode` is on, so the block
  never renders dark inside a white lesson.
- **Copying works without permissions.** The copy button tries the synchronous `execCommand` path
  first, because that runs inside the click's activation window and works in frames never granted
  `clipboard-write`. If every path fails it selects the prompt and tells the learner to press
  Ctrl+C, so the deliverable is never trapped in the page.
- **No modals.** Destructive actions confirm on the button itself with a second press, so a frame
  without `allow-modals` can't turn "Start over" into a dead button.
- **Pure ASCII.** The file contains no bytes above 127 - typography is HTML entities and `\u`
  escapes - so it can't be mangled by a host page serving a different charset.

Two things to verify on the real published link, because a Review 360 link is a different domain
and pipeline from preview:

1. **Re-run `tools/rise-storage-probe.html` there** if you're using the multi-block layout. The
   split depends on blocks sharing a storage origin, and that verdict doesn't automatically carry
   over from preview. Read the *marks*, not the event counter — a `storage events` reading of 0 on
   the lower block is expected (it has been seen on every run so far) and harmless, because the
   activity does not depend on events.
2. **Check the block height.** Rise decides how tall an embed is. The chat scrolls internally, but
   the capture block grows with each workflow card - make sure a learner with five steps isn't
   clipped.

Also specific to Review 360: it collects reviewer comments, not activity data. Nothing a learner
writes comes back to you - the master prompt exists only in their browser until they copy it out.
And because storage is keyed to the serving domain, progress doesn't follow a learner between
preview, the review link, and any later LMS copy.

---

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

---

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
npm run preview  # build, then the whole nine-block lesson at http://127.0.0.1:8080
npm run build    # regenerate dist/ after editing index.html
npm run serve    # serve an already-built dist/ without rebuilding
npm test         # all eleven suites, 317 assertions
```

### Previewing the lesson before it goes into Rise

`npm run preview` builds everything and serves two views of the same built files.

**`/` &mdash; the plain preview.** All nine blocks stacked in order, each loading its built file
verbatim, with grey bands standing in for your own Rise text between them. It is the assembled
lesson, not a mock-up of one &mdash; the blocks share state through `localStorage` exactly as they
will in a published lesson, so filling in block 2 unlocks block 3 in front of you.

**`/builder.html` &mdash; the lesson builder.** The same blocks, but yours to arrange: draft the
Rise copy that introduces each one, choose which block follows it, drag the rows into order, and
export the result as Markdown or JSON. Storyboard and working preview in one page, which is the
point &mdash; a planning doc can't show you the block, and a preview can't hold your copy.

Two pieces of state, deliberately kept apart. Your outline lives under `bw_builder_outline`; the
learner's answers live under `brainstorm_workflow_data` with the blocks. **Clear learner data**
resets the second so you can walk the lesson again without touching a word you wrote; **Reset
outline** does the opposite. Nothing you type is ever parsed as markup, so draft copy containing
`<` or `&` is safe &mdash; and dragging a row inserts it at the target, shifting the rest, rather
than trading two rows.

- **Serve it, don't open it.** Chromium gives a `file://` page no `localStorage`, and without that
  the blocks cannot see each other. The bar at the top says which of the two you're looking at.
- **Blocks size themselves.** Each one posts its height as it grows, so a long chat doesn't end up
  behind an inner scrollbar the way a fixed-height frame would.
- **Start over** clears the whole lesson. It reloads first and clears after, because every block
  flushes its state on the way out and would otherwise write it straight back.
- Individual blocks are on the same server by filename &mdash; `/3-coach-workflow.html` &mdash; and
  so is `/rise-storage-probe.html` for checking whether a host shares storage at all.
- `node preview.mjs --inline` emits `dist/preview-standalone.html`, one self-contained file with
  every block embedded, for hosting the preview somewhere that has no sibling files to link to.

`blocks.mjs` is the single list of what blocks exist. `build.mjs` emits a file per entry,
`preview.mjs` stacks the lesson ones in order, and `builder.mjs` offers all of them in its
dropdown &mdash; so a block added there appears in all three without anyone remembering to update
the other two. That is the drift the earlier standalone builder had: its dropdown still described a
six-step lesson months after the activity had nine blocks.

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

- `test/scripted-coach.test.mjs` — the full walkthrough on the built-in coach: gating and
  validation, the card builder, prompt generation, the conversation, V2 capture, persistence
  across reloads, user-edit precedence, clipboard, reset, and no horizontal overflow at 360px.
- `test/live-endpoint.test.mjs` — the adapter against a stub coach: request shape, every accepted
  response shape, and the failure modes (HTTP error, timeout, unreachable host, unrecognized
  payload) including that a learner can still finish with the coach down.

- `test/multi-block.test.mjs` — the full five-block lesson as five iframes on one page: that each
  block shows only its own slice and topic, that the three chats are genuinely separate transcripts
  that pool their answers into one prompt, that a later chat quotes what an earlier one captured,
  that no block clobbers another in either direction, that restarting one chat leaves the others
  intact, and that reload and Start over behave across all five. Also runs the whole flow with
  `storage` events swallowed; a below-the-fold block that syncs only when scrolled into view; and a
  negative control confirming the sync really does break with every mechanism switched off.
- `test/probe.test.mjs` — checks the storage probe itself reports SHARED between same-origin
  iframes and BLOCKED inside a sandboxed one, so its verdict in Rise can be trusted.
- `test/answer-quality.test.mjs` — the four defects persona testing found and their fixes: that a
  vague answer is pushed back on exactly once and then accepted, that a specific one never is, that
  thin sections are marked and the block warns about them, that good answers produce neither, that a
  sweeping handoff plus a carve-out is reconciled explicitly, and that the task section names the
  step in instruction voice with the complaint dropped.
- `test/dist.test.mjs` — rebuilds `dist/` and runs the real nine-block lesson using those files
  verbatim, so the artifacts that actually go into Rise are the ones under test.
- `test/split-capture.test.mjs` — the capture form as three separate blocks: that each renders one
  step, that block 2 waits on the task being named and block 3 on the workflow being mapped, that
  each unlocks live when its prerequisite arrives, and that editing one cannot wipe another.
- `test/capture-chat.test.mjs` — blocks 3 and 4, the workflow captured by conversation: that a
  run-on sentence, a typed numbered list and a one-per-line list all land in the same steps array,
  that a correction by number rewrites only that step, that "yes that looks right" is read as
  agreement while "yes, but step 2 is wrong" is read as an edit, that a step remembered late lands
  where the learner said it goes, that a tool count that doesn't match the step count is asked
  about before it is guessed at, and that restarting one chat clears only the half it took down.
- `test/builder.test.mjs` — the lesson builder: that it opens on the shipped nine with the real
  blocks embedded, that draft copy containing `</textarea>` survives a reload byte for byte and
  never reaches the page as markup, that dragging a row inserts rather than swaps, that swapping
  the block under a piece of copy loads that block, that removing takes two presses, that the
  exports describe the lesson as arranged, and that clearing the learner data leaves the outline
  untouched (and the reverse).
- `test/preview.test.mjs` — the preview page: that all nine blocks load their built files, that the
  page reports honestly whether storage is shared, that frames size themselves rather than sitting
  at a fixed height, that the full lesson runs end to end inside it, and that Start over really
  starts over rather than being undone by the save-on-exit flush.
- `test/rise-hardening.test.mjs` — the iframe failure modes above: that the file is pure ASCII and
  modal-free, that dark mode stays off by default and still works when opted in, that copying
  survives a missing clipboard API and leaves the text selected when it can't copy at all, and
  that one press of Start over never erases anything.

Every suite fails on any uncaught page error or unexpected console error, so a runtime exception
anywhere in the flow shows up as a test failure.
