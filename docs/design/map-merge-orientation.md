# Map merge — technical orientation

**Status:** orientation only. Nothing in the production journey was changed.
**Base:** `e69da1f` on `main`.
**Method:** the two load-bearing claims below were spiked in a throwaway copy of the
repo and run, not reasoned about. The spike was discarded; the production tree is clean.

---

## 1. Decided / open, for the record

**DECIDED.** Describe is not a standalone stage. Describe + Map become one Map learning
experience: two reading pages, then the existing form. The form stays a form; the retired
conversational workflow capture stays retired.

**SETTLED IN PRINCIPLE, after this orientation was written.** The journey is five stages:
Identify → Map → Envision → Refine → Deploy, with Envision returning as a future-state
design stage rather than the retired draft-prompt screen. **Branch B is the live branch.**

Branch A below is kept as written, because it is the record of what a four-stage journey
would have cost and because the count-decoupling work it prompted has since landed —
`STATIONS` is now the only place the journey's length is written, so §4c's broken
four-station map no longer happens. Read Branch A as history, not as an option.

**Still open:** Envision's exact interaction and data contract. See
`docs/design/restructure-brief.md` §8.5 for the current lean.

---

## 2. Is the multi-page lesson machinery a clean fit? — Yes, verified

I spiked exactly the shape you proposed onto the stage that owns the form:

```js
3: { pages: [
      { title: "Describe the workflow in full", sub: "Picture the process as it really is",
        blocks: STAGE_2_LESSON },
      { blocks: STAGE_3_LESSON }
    ] }
```

**Zero changes to the lesson system were needed.** Observed, in order:

| Step | Result |
|---|---|
| Enter stage | page 1, counter `1 of 2`, no Back, title from the page override |
| Continue | page 2, counter `2 of 2`, Back appears, title reverts to the stage heading |
| Back | page 1, title override restored, counter `1 of 2` |
| Continue ×2 | reading ends, the form appears |
| Save draft | migrates from `.bw-lesson-actions` to the form's `.bw-actions` on its own |
| `defs` blocks | render on page 2 only (5 pairs, 1 note) — no bleed |
| Leave and re-enter | resets to page 1 |

This is what `lessonPages()`, `onLessonPage()`, `advanceLesson()` and
`placeWorkspaceExtras()` were built for; the path has simply had no content exercising it
until now. **The merge is a data change, not a code change, to the lesson layer.**

One consequence worth stating: `STAGE_LESSON[2]`'s `work: false` flag disappears with the
merge, because the merged Map ends in a form rather than in reading. `stageHasWork()` and
the `work: false` branch stay in the code and go unused again — the same position the
multi-page path was in until today. Leave them; they are four lines and this journey has
already needed both.

---

## 3. Proposed merged Map flow

Content moves verbatim. No copy rewritten.

```
MAP  —  Break the process into its real steps.

  Page 1  "Think smaller"
          STAGE_2_LESSON  (currently stage 2's blocks — the whole Describe reading)
          4 × p, 1 × turn
          page title override: the current stage-2 heading
          ⚠ its turn block currently reads "Next, you'll turn what you just pictured
            into explicit steps — each one with the tool it happens in."
            That is now a page turn, not a stage turn. Mechanically fine; flagged
            under §8 because it is copy and you asked me not to rewrite it.

  Page 2  "Get specific"
          STAGE_3_LESSON  (currently stage 3's blocks — the whole Map reading)
          2 × p, 1 × defs (5 integration pairs, 1 human-in-the-loop note)
          no title override → inherits the stage heading

  Work    the existing #bw-workflow-wrap form, unchanged
          action + where/how per row, min 2 rows, existing validation
```

Station identity for the merged stage: **Map**, accent `map`, art `map`, blurb "Break the
process into real steps.", `done()` = `Complete · N steps mapped` — all of which already
exist on the current stage 3 and move with it.

The `describe` accent token (`--id-describe` / `--done-describe`, amber) becomes
**unused in Branch A** and is the natural token for the new station in Branch B.

---

## 4. Blast radius

Everything below is keyed by *step number*, which is what the merge changes. Split into
"the merge itself" and "the renumber", because they are separable and the second is where
the branch choice bites.

### 4a. The merge (identical in both branches)

| Item | Change |
|---|---|
| `STAGE_LESSON` | delete the `2:` entry; give the Map entry `pages: [describe, map]` |
| `STAGE_2_LESSON` / `STAGE_3_LESSON` | no content change; **rename the identifiers** — they are named for step numbers that stop meaning anything. Suggest `MAP_PAGE_THINK_SMALLER` / `MAP_PAGE_GET_SPECIFIC` |
| `STAGE_LESSON[...].work` | the `work: false` flag leaves with stage 2 |

### 4b. The renumber

| Item | Coupled how | Branch A | Branch B |
|---|---|---|---|
| `STATIONS` | array position = step number; each entry carries `place` | rewrite 4 entries; **re-alternate `place`** to above/below/above/below | rewrite 5 entries; `place` pattern unchanged |
| `STAGE_CONTEXT` | keyed 1–5 | drop one key, shift 4→3, 5→4 | replace key 2's content, key 3 becomes Envision |
| `STAGE_ART` | keyed by `art` name, **not** by number | no change | add art for Envision |
| `STAGE_INFO` | keyed by number (`1`, `4`) | `4` → `3` | unchanged (Refine stays 4) |
| `STAGE_COACH` | `{1: true, 4: true}` | → `{1: true, 3: true}` | unchanged |
| `STAGE_CONVO` | every step needs an entry or `sKey()` falls back to `"all"` and leaks stage 4's transcript onto another stage | `{1,2,3,4}` | `{1..5}`, key 3 renamed |
| `stepValid` | `case` per number | cases collapse: 2 = the form, 3 = coach, 4 = true | 2 = the form, 3 = ? (Envision), 4 = coach, 5 = true |
| `warningFor` | `case` per number | form warning → case 2; coach warning → case 3 | form warning → case 2; coach stays 4 |
| `GATES` | `.step` and `.notice` are a pair; notice ids are `#bw-prereq-N` in markup | all four gate entries re-pointed | same, one fewer shift |
| `ROLES` | `steps: [n]` per slice | `workflow`→[2], `draft`→retire or [2], coach roles→[3], `artifact`→[4] | `workflow`→[2], coach roles→[4], `artifact`→[5] |
| `render()` re-validation | `[1, 3].forEach` | → `[1, 2]` | → `[1, 2]` |
| `openStep` | `n === 5` triggers `refreshV2`; `n === 3 && isCaptureChat` | both shift | one shifts |
| `goNext` | `Math.min(5, n + 1)` ×2 | → 4 | unchanged |
| `applyRole` | `progress.unlocked = 5`; capture role's `while (u < 3 ...)` | both shift | `unlocked = 5` stays |
| `init` | `ownsStep(5) && ... current === 5` | → 4 | unchanged |
| **Progress math** | `[1,2,3,4,5]` arrays ×4; `doneCount / 5 * 100`; `doneCount === 5`; `"Step " + n + " of 5"` ×2; `n / 5 * 100` | **every one changes** | **none change** |
| **`drawRail()`** | `xs = [10, 30, 50, 70, 90]` — five waypoints hardcoded | **must be regenerated for 4** | unchanged |
| **`renderMap()`** | `while (resume < 5 && ...)` | → 4 | unchanged |
| **`css/home.css`** | `.bw-spine { grid-template-columns: repeat(5, 1fr) }` + five `nth-child(N)` rules | **both change** | unchanged |
| Markup | `#bw-panel-1..5`, `#bw-head-N`, `#bw-warn-N`, `#bw-prereq-N`, `data-next="N"`, five `<li data-step>` | one `<li>` removed, the rest renumbered | panels re-pointed, count unchanged |
| Landing copy | "A guided **5-step** experience" (`index.html:190`); "moves through **five stages**" (`:35`); worked example has 5 numbered rows | all change | unchanged |
| Admin | `adminFillStage` switches on `n === 3` / `n === 5`; `[1,2,3,4,5].forEach`; jump row builds 5 buttons | all change | `n === 3` → the form's new number only |
| `ADMIN_SAMPLE` | `turns` keyed by conversation name, not number | no change | no change |
| Mini-node strip | `buildMiniBar()` iterates `STATIONS` | **count-agnostic already** | count-agnostic |
| `statusOf()` | reads `progress` only | no change | no change |
| `PROMPT_STAGE_ORDER`, `SECTION_LABELS`, `botAnswers` | keyed by conversation/answer name | no change | no change |

### 4c. Empirically confirmed, not inferred

Deleting one station from `STATIONS` and changing nothing else produces a **visibly broken
map**: cards occupy four of five grid columns leaving a dead column, the rail still runs
its five-waypoint path and overshoots past the last station, `place` alternation breaks to
above/above/below/above, and the numbers read 01/03/04/05. Screenshot taken during the
spike. This is the concrete difference between the branches.

---

## 5. Branch A vs Branch B — what actually differs

**They share the merge entirely.** The difference is the renumber.

**Branch A (four stages)** is the larger change, and not because it removes a station —
because **Refine and Deploy renumber too**, and five-ness is baked into three places that
have nothing to do with the stage list:

1. **Progress arithmetic** — `doneCount / 5 * 100`, `doneCount === 5`, `"Step N of 5"`,
   `n / 5 * 100`, four `[1,2,3,4,5]` literals.
2. **Rail geometry** — `drawRail()`'s `xs = [10, 30, 50, 70, 90]`.
3. **Map layout CSS** — `repeat(5, 1fr)` and five `nth-child` column rules.

None of those are touched by Branch B. Branch A also needs `place` re-alternated, the
landing's "5-step" and "five stages" copy changed, and the worked example reduced to four
rows. The coach's `SCRIPTS.all` ends with "move on to **Step 5**" — a learner-visible
string that becomes wrong in A and stays right in B.

**Branch B (five stages)** keeps every count, every piece of geometry, every CSS rule and
all the progress math exactly as they are. The work is: merge the two readings into Map at
position 2, and define whatever occupies position 3. Mechanically it is close to a
relabel plus one new stage's content.

If the count-coupled work above is a factor in the decision, it is roughly a day's
difference in care, not in cleverness — all of it mechanical, all of it testable.

A third option exists that neither of you named, so I mention it once without recommending
it: **Branch A's count coupling could be removed first** (derive the rail from
`STATIONS.length`, the grid from a CSS variable, the progress math from the array). That
would make the station count data rather than structure, and make any future add/remove a
one-line change. It is exactly the kind of refactor your brief told me not to do now.

---

## 6. Persistence and backward compatibility

`readStored()` rejects anything whose `version !== 2` and starts clean. `progress.done`,
`progress.entered`, `progress.current` and `progress.unlocked` are all keyed by step
number, so **any renumber silently reinterprets an in-flight learner's saved progress** —
a save that said "stage 3 done" would mean the form in Branch A and Envision in Branch B.

There is no per-step migration code and none is needed. Bump `version` to `3` in
`defaultData()` and in the `readStored()` guard, and every existing save is discarded
cleanly on next load. (`CONFIG.storageKey` has a suffix mechanism for the same purpose;
`version` is the cheaper of the two and is already checked.)

Cost of discarding: a learner mid-activity loses their work. Given there is no account
system, no cohort has been through this yet, and the stage a save refers to would
otherwise be wrong, discarding is the honest option. **Flagging it rather than deciding
it** — if a cohort is already in flight, say so and I will write a mapping migration
instead.

One smaller note: `conversations` and `mockProgress` are keyed by conversation *name*, not
number, so they survive a renumber untouched. Only `progress` is at risk.

---

## 7. Tests that would intentionally change

`test/journey-contract.test.mjs` is written as a temporary contract and says so in its
header. On the merge these **should fail and be rewritten**, not patched:

- `stepValid(2): reading stage 2 finishes it, with nothing filled in` — stage 2 becomes
  the form; this assertion inverts.
- `warningFor(3): the empty form complains as step 3` → step 2.
- `GATES: … behind the step 3 notice` → the notice moves.
- `ROLES.workflow renders the card form / which is panel 3` → panel 2.
- `render(): a stage 3 that no longer validates loses its tick` → stage 2.
- `Map is the third` → second.
- `the map shows five stations` — **survives in B, must change in A.**

Other suites that will need updating, from the earlier reorder's experience: `timeline`
(station names, locked-reason strings, the `Complete · N steps mapped` fixture stage),
`learning-stage` (the mini-label order string, the reading-only block, panel/`data-next`
ids), `scripted-coach` (the walkthrough's stage sequence and its `readLesson` counts),
`admin` (skip sequence and the fill-stage number). `capture-chat`, `live-endpoint`,
`answer-quality`, `coach-phase` and `hardening` should be untouched by a pure renumber —
they key off conversation names and behaviour, not step numbers.

---

## 8. Hazards and hidden coupling found

1. **`STAGE_CONVO` must have an entry for every step.** `sKey()` falls back to `"all"`,
   which would render stage 4's transcript on a stage that has no coach. Silent, and it
   looks like a rendering bug rather than a config gap.
2. **`GATES[].step` and `GATES[].notice` are a pair** that must move together — the notice
   is a DOM id (`#bw-prereq-N`). Splitting them shows the wrong step's prereq message,
   which the journey-contract suite now catches.
3. **`drawRail()` hardcodes five x-positions.** Easy to miss because the map still renders
   — it just draws the wrong line.
4. **`place` is data, not derived.** Removing a station breaks above/below alternation
   silently.
5. **`wireStep1/2/4/5` are already misnamed** after the last reorder and will get worse.
   Left alone per your brief; there is a note at `wireStep2`'s definition.
6. **Copy flagged, not changed:** page 1's turn block ("Next, you'll turn what you just
   pictured into explicit steps…") becomes a page turn rather than a stage turn. It reads
   acceptably either way, but it was written three days ago for the split and is worth a
   glance when the merge lands.
7. **`STAGE_EXAMPLES[1]` and `STAGE_INFO[1]`** remain unreachable dead data. Untouched —
   dead-code cleanup is an open decision.

---

## 9. What I did not do

No production file changed. No renumber, no Envision, no content rewritten, no
modularization, no dead-code removal, no helper renames, no persistence redesign, no
coach, Deploy or draft-prompt changes. The spike that produced §2 and §4c was a full copy
of the repo in a scratch directory and has been deleted.
