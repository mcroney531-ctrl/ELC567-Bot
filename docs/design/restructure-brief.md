# Restructure brief — AI Workflow Builder

**For:** GPT, as design collaborator on this activity
**From:** the build session
**Date:** 2026-09-26
**Status of the build:** all of section 1 is live and deployed. Sections 3–5 are open.

You don't need repo access to use this. Everything below is the activity as a learner
meets it, plus what's decided, plus what we need you on.

---

## 1. What the activity is now

Five stations on a journey map. The map is home; a learner enters a station, does it, and
is carried into the next one inside the workspace rather than being sent back to the map.

| # | Station | What the learner meets | What they produce |
|---|---|---|---|
| **01** | **Identify** | A written lesson, then **Continue** into an AI coach | Their problem statement — the coach writes it down from the conversation |
| **02** | **Describe** | One screen of reading. **Continue** leaves the stage | Nothing. It is reading. |
| **03** | **Map** | One screen of reading, then **Continue** → a **form** | An ordered list of steps, each with the tool it happens in |
| **04** | **Refine** | An AI coach conversation | The answers a prompt can't guess — what to hand over, what good looks like, what stays theirs |
| **05** | **Deploy** | The finished master prompt, editable and copyable | The thing they leave with |

**AI appears in exactly two places: 01 and 04.** Everything between them is reading and a
form. That's a deliberate result of the decisions below, but it's worth seeing plainly,
because the activity is *about* AI and a learner may expect more of it.

### What changed in this pass

- **02 and 03 swapped, and were renamed.** The station previously called *Envision* (which
  showed an auto-generated draft prompt) is gone. *Map* moved from 02 to 03.
- **The two readings that used to be pages 1 and 2 of one stage are now stages of their
  own.** "Describe the workflow in full" is 02. "Map the workflow and tools" is 03.
- **The draft-prompt screen is retired.** A learner now sees **no prompt at all until 05**.
  The draft is still generated behind the scenes — it's part of what the coach is working
  from — but it is not shown.

### Station framing copy, as it currently reads

| # | Name | Card blurb | Panel line |
|---|---|---|---|
| 01 | Identify | Define the problem worth solving. | *"Clarity today. Impact tomorrow."* |
| 02 | Describe | Picture the process as it really is. | *"The blueprint comes before the build."* |
| 03 | Map | Break the process into real steps. | *"People, process, and data create the full picture."* |
| 04 | Refine | Sharpen ideas into specifics. | *"Turn ideas into a clear plan."* |
| 05 | Deploy | Turn it into action. | *"From plan to progress. Keep it going."* |

**02's name, blurb and quote are all placeholder** — written in the build session, not by
the author. See question 1.

---

## 2. Decisions already made, and the reasoning

These are settled unless someone makes a case. The reasoning matters more than the
outcome, because it's what a future change has to argue with.

### 03 Map uses a form, not a coach

There *is* a working conversational version of this step — a coach that takes a run-on
description and parses it into a numbered list with tools attached. It exists in the
codebase and it is not wired into the activity. The form beat it:

- **The output is structured data** — an ordered list of (action, tool) pairs that
  everything downstream is generated from. A form captures that shape directly; a
  conversation has to reconstruct it.
- **The learner can see and edit all of it at once.** Fixing step 3 in a form is clicking
  step 3. In a chat it's "no, the third one is wrong," and the coach has to infer what you
  meant.
- **Prose-into-records was a bug farm.** Real examples from testing: *"oh and then I email
  it"* became a step named *"Oh and then I email it"*; *"yes that looks right"* was parsed
  as a new workflow step. Both fixed, but that class of bug is inherent to the approach and
  buys nothing here.
- **03's own copy argues for it.** It tells the learner to stop glossing and enumerate —
  *"find the documents, pull the information needed, open the email template, then write
  the email."* A numbered form **is** that instruction. A chat box invites exactly the
  run-on sentence the page just warned against.

### The master prompt is hidden until 05

The learner sees no prompt until Deploy. The draft is still built continuously — it's what
gives the 04 coach something real to reason over — but showing a half-finished prompt at
03 made the activity feel finished before it was, and gave the learner a thing to fiddle
with instead of a question to answer.

### One claim was rescoped

03's copy used to say *"Other times, AI might pick up on one or present a workaround"* —
about spotting an integration between two of your named tools. Read in place, that was a
promise about **this activity's coach**, which does not do that. It now reads *"If you're
brainstorming with AI in a session, the model might pick up on one or present a
workaround"* — the same claim, aimed at AI practice generally, where it's true.

This matters for 04: **spotting integrations is now unclaimed work.** If the 04 coach is
going to do it, that's a new promise and we should make it deliberately.

---

## 3. The 04 Refine coach — designed but not built

This is the main open build. The author's sketch, close to verbatim:

> Coach opens with something like *"Okay, so here's my understanding. \_\_\_\_\_ Here are a
> few ways that AI might be able to help in your process \_\_\_\_\_. What would the overall
> ideal scenario / end-game be for you? How do you envision splitting the
> responsibility(s)?"*
>
> (Basically — describe the best possible version of AI helping with this workflow, the
> ideal / best-case scenario / ideal outcome.)
>
> The ideas should be matched to master-prompt content — **but the master prompt isn't
> shown to the learner**; it's knowledge and context for the coach, so it can give real
> ideas about how AI could help with whatever they've put in so far.
>
> We can provide some examples that match the integration examples we already gave:
> *"I want \_\_\_\_\_"*

So the opening does three things in order: **reflect back**, **propose**, **ask for the
ideal end-state and the split of responsibility**.

### The constraint you need to know about

The activity runs on two different coaches, and they are not equally capable.

- **Live coach** (a real model behind a proxy): can genuinely read the learner's tools and
  propose plausible integrations. Does the sketch above well.
- **Scripted coach** (built-in, no backend, no API key): cannot invent anything. The best
  honest approximation is keyword-matching the learner's named tools against the five
  integration examples from 03 — *"you named Gmail and Google Docs; that's the Spreadsheet
  → Email shape."* Real, but noticeably dumber.

**Most testing and review happens on the scripted coach**, and the activity currently ships
with the live endpoint switched off. So the question isn't just "what should the coach
say" — it's "how much of this design depends on a model actually being there." See
question 3.

---

## 4. Open questions — this is what we need you on

**1. Station names.** *Describe* is a placeholder. The five names are meant to read as
transferable practice, not as this activity's furniture — a learner should recognise the
pattern outside the course. The current set is Identify / Describe / Map / Refine / Deploy.
Is *Describe* right for "picture your current process in detail"? Does the set still hang
together with *Envision* gone? Its blurb and quote are placeholder too.

**2. Is 02 worth a station?** It's one screen of reading and nothing else. On the journey
map it gets equal visual weight to stages where the learner does real work, and it ticks
off "complete" for having been read. Options as we see them: leave it (the content earns
the beat), fold it back into 03 as a first page, or give it something small to do.

**3. How much should the design lean on the live coach?** Live, the 04 opening works as
sketched. Scripted, the "here are a few ways AI might help" move degrades to keyword
matching. Do we (a) design for live and accept the scripted version is a shadow, (b) design
something both can do honestly, or (c) make the scripted coach's limits visible to the
learner rather than papering over them?

**4. The 04 opening and the "I want \_\_\_\_\_" starters.** We can draft these, but they're
instructional copy and the author has been writing that. Do you want to take them? They
should line up with the five integration examples already on 03 (Spreadsheet → Email, PDF
Reader → File Storage, File Storage → Calendar, Video Conferencing → Task System, Claude
Connector → CRM).

**5. A line that's now slightly wrong.** 02 ends with *"…write each specific step and
behavior below."* The form is a Continue away, on 03 — not below. Kept verbatim rather than
silently edited. Fix it, or leave it and change the layout?

**6. Three phases vs five stages.** The Course Overview says the activity *"is structured
around three phases: defining your problem and workflow, refining your approach through
conversation, and exporting a production-ready prompt."* The map shows five. They do
reconcile — define = 01+02+03, refine = 04, export = 05 — but a learner reads "three" and
counts five. Reword the overview, or name the three phases on the map?

**7. Two names for the same thing.** The landing page is headed *"Brainstorm an
AI-Powered Workflow."* Home is headed *"AI Workflow Builder — Turn Ideas Into Impact."*

**8. Theme split.** The landing is light lavender; home and every stage are the dark shell.
The landing is the last screen in the old visual language.

**9. Lessons for 04 and 05.** No copy written. 01, 02 and 03 have theirs.

---

## 5. What's true about the build, if you need it

- Live and deployed; every push to `main` goes out.
- The whole activity is a static site — no backend. The coach, when live, talks to a proxy;
  there is never an API key in the page.
- The learner's work is saved in their browser. There is no account and nothing reaches a
  server.
- There's an admin mode (`?admin=1`) for walking the activity end to end without answering
  it — useful if you're reviewing screens rather than doing the exercise.
- 491 automated checks currently pass, covering navigation, state, both coaches, and the
  copy's structure.
