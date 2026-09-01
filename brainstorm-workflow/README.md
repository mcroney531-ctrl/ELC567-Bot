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
| `dist/1-capture.html` | The problem + workflow form |
| `dist/2-coach-handoff.html` | Chat: which step should the AI take over |
| `dist/3-coach-standards.html` | Chat: what good looks like, what stays yours |
| `dist/4-coach-guardrails.html` | Chat: house rules, then hands back the prompt |
| `dist/5-artifact.html` | The finished master prompt |
| `dist/single-block.html` | *Or* all five steps in one block, instead of the above |

Each file is the whole activity with its `blockRole` already set, so you never hunt for a config
line in Rise's code editor. Put your own Rise text blocks between them. Edit `index.html` and re-run
the build to regenerate all six; `npm test` runs the built files through the full lesson so a broken
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
| 1 | `"capture"` | The problem + workflow-map form, and the draft prompt (keeps the intro) |
| 2 | `"coach-handoff"` | Chat: which step should the AI take over? |
| 3 | `"coach-standards"` | Chat: what does a good result look like, and what stays yours? |
| 4 | `"coach-guardrails"` | Chat: context and house rules — closes by handing back the prompt |
| 5 | `"artifact"` | The finished master prompt, editable and copyable |

Use any of the three chats, in that order — you don't need all three. Leave `blockRole` at its
default `"all"` to keep the whole activity in one block.

**The three chats are separate conversations that build one shared master prompt.** Each has its own
transcript, its own heading, and its own one or two questions; each writes its own slice of the
answers. Chat 2 opens by quoting what chat 1 captured, chat 3 by quoting chat 2, so it reads as one
coach picking up a new thread rather than three strangers asking overlapping questions. All of them
stay live and editable — a learner can scroll back and revise, and the change flows forward.

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
| `minProblemChars` | `40` | How much Step 1 needs before Step 2 unlocks. |
| `minWorkflowSteps` | `2` | Filled-in cards Step 2 needs. Also the floor for the remove button. |
| `minChatTurns` | `2` | Learner replies Step 4 needs before Step 5 unlocks. |
| `blockRole` | `"all"` | Which slice this block renders: `"all"`, `"capture"`, `"coach-handoff"`, `"coach-standards"`, `"coach-guardrails"`, `"artifact"`. See above. |
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
npm run serve    # http://127.0.0.1:8080 — use this, not file://, so localStorage works
npm run build    # regenerate dist/ after editing index.html
npm test         # all six suites, 173 assertions
```

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
- `test/dist.test.mjs` — rebuilds `dist/` and runs the real five-block lesson using those files
  verbatim, so the artifacts that actually go into Rise are the ones under test.
- `test/rise-hardening.test.mjs` — the iframe failure modes above: that the file is pure ASCII and
  modal-free, that dark mode stays off by default and still works when opted in, that copying
  survives a missing clipboard API and leaves the text selected when it can't copy at all, and
  that one press of Start over never erases anything.

Every suite fails on any uncaught page error or unexpected console error, so a runtime exception
anywhere in the flow shows up as a test failure.
