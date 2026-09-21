# State Behavior Specification

## Canonical lifecycle

Every step moves through exactly these four presentation states:

`locked -> available -> current -> completed`

Stage identity and step state are separate concepts.

- **Stage identity** answers: “Which step is this?”
- **State** answers: “What can the learner do with this step right now?”

Do not replace stage identity colors with state colors. Layer state treatment on top of stage identity.

## Locked

Meaning: the learner has not reached this step yet.

Visual behavior:

- muted slate / glacier treatment
- low saturation
- low interior brightness
- subdued native icon and copy
- no active glow
- lock cue
- silver/glacier waypoint with number
- stage name remains visible
- future steps remain visible; they are not hidden

Interaction:

- not enterable
- disabled semantics
- not focusable if the implementation treats truly disabled controls as non-interactive

## Available

Meaning: the learner may start this step now.

Visual behavior:

- native stage identity becomes readable again
- calm green readiness treatment
- green node with number
- no pulse
- no aggressive glow
- slight hover/focus lift allowed

Interaction:

- clickable
- keyboard accessible
- entering the stage changes it to `current`

## Current

Meaning: this is the step actively in progress.

Visual behavior:

- active green treatment
- brighter edge/glow than Available
- subtle pulse on card and/or waypoint
- native stage identity remains readable
- the pulse is the primary distinction from Available, not a different state hue

Motion guidance:

- suggested pulse: 2.2–3.0 seconds, ease-in-out, infinite
- subtle scale/glow modulation only
- no arcade flashing
- disable animation under `prefers-reduced-motion`

Interaction:

- clickable / re-enterable
- use `aria-current="step"` or equivalent

## Completed

Meaning: this step has been finished and is settled.

This treatment is locked.

### Interior

- substantially replicate the Locked-state interior
- dimmed original icon remains
- dimmed title and supporting text remain
- reduced saturation
- reduced brightness
- reduced glow
- do not replace the original icon/text with the completion symbol

### Outer stroke

Only the outer stroke stays vividly colored in the step’s native identity color.

Examples:

- Identify completed → blue outer stroke
- Map completed → teal/aqua outer stroke
- Envision completed → orange/amber outer stroke
- Refine completed → violet/purple outer stroke
- Deploy completed → cyan/blue-teal outer stroke

### Check overlay

- large circled checkmark overlays the dimmed content area
- underlying icon/text remain visible beneath
- check/circle color matches the stage’s completed timeline marker color family
- keep the symbol centered and deliberate

### Timeline marker

- replace the numbered circle with a star-in-circle marker
- use a darker/richer accent version of that stage’s native color
- not all completed markers are gold

Examples:

- 01 → deep blue
- 02 → deep teal/aqua
- 03 → deep amber/orange
- 04 → deep violet
- 05 → deep cyan/teal

Interaction:

- completed steps remain revisitable
- completed does **not** mean disabled

## Progression examples

Initial:

- 01 available
- 02–05 locked

01 active:

- 01 current
- 02–05 locked

After 01 completes:

- 01 completed
- 02 available
- 03–05 locked

02 active:

- 01 completed
- 02 current
- 03–05 locked

Mid-flow:

- 01–02 completed
- 03 current
- 04–05 locked

Late-flow:

- 01–03 completed
- 04 current
- 05 locked

Final active:

- 01–04 completed
- 05 current

Finished:

- 01–05 completed

## Invariants

- generally only one `current` step at a time
- generally only one next `available` step at a time
- all later steps remain `locked`
- completed steps remain accessible
- state changes must not cause layout shift
